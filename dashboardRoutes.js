import express from 'express';
import pool from '../config/db.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

function parsePeriod(q) {
  const year = parseInt(q.year, 10);
  const month = parseInt(q.month, 10);
  if (!year || !month || month < 1 || month > 12) {
    const err = new Error('Invalid or missing year/month');
    err.status = 400;
    throw err;
  }
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 1));
  return { year, month, start, end };
}

function countWeekdays(start, endExclusive) {
  const startDate = new Date(start);
  const endDate = new Date(endExclusive);
  let count = 0;
  for (let d = new Date(startDate); d < endDate; d.setUTCDate(d.getUTCDate() + 1)) {
    const day = d.getUTCDay();
    if (day !== 0 && day !== 6) count++;
  }
  return count;
}

function toISODate(d) {
  return new Date(d).toISOString().slice(0, 10);
}

function clampPct(x) {
  const n = Number(x || 0);
  if (Number.isNaN(n)) return 0;
  return n < 0 ? 0 : n > 100 ? 100 : n;
}

function getYearlyAvailableHours(workHoursPerWeek, year) {
  // Calculate working days for the entire year
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const yearEnd = new Date(Date.UTC(year + 1, 0, 1));
  return Number((((workHoursPerWeek / 5.0) * countWeekdays(yearStart, yearEnd)).toFixed(2)));
}

// GET /api/dashboard/employee/:employeeId?year=YYYY&month=MM&includeWeekly=bool
router.get('/employee/:employeeId', authenticateToken, async (req, res) => {
  try {
    const employeeId = Number(req.params.employeeId);
    const { year, month, start, end } = parsePeriod(req.query);
    const includeWeekly = String(req.query.includeWeekly || 'false').toLowerCase() === 'true';

    // AuthZ: admin and PM can view any employee, individuals can view self
    const canViewAllEmployees = req.user.role === 'admin' || req.user.role === 'pm';
    if (!canViewAllEmployees && req.user.employeeId !== employeeId) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    // Employee basics (with defaults)
    const { rows: empRows } = await pool.query(
      `SELECT EmployeeID, Name, COALESCE(WorkHoursPerWeek, 42.5) AS work_hours_per_week, 
              COALESCE(Tribe, '') AS tribe, COALESCE(Team, '') AS team
       FROM Employees WHERE EmployeeID = $1`,
      [employeeId]
    );
    if (empRows.length === 0) return res.status(404).json({ error: 'Employee not found' });
    const emp = empRows[0];

    const wd = countWeekdays(start, end);
    const availableHours = Number(((emp.work_hours_per_week / 5.0) * wd).toFixed(2));

    // Allocations within projects overlapping the month
    // Allocations specifically for the requested month/year
    const { rows: allocRows } = await pool.query(
      `SELECT a.projectid, p.projectcode, a.allocatedhours
       FROM allocations a
       JOIN projects p ON p.projectid = a.projectid
       WHERE a.employeeid = $1
         AND a.allocation_year = $2
         AND a.allocation_month = $3
       ORDER BY p.projectcode`,
      [employeeId, year, month]
    );
    const allocatedHours = Number((allocRows.reduce((s, r) => s + Number(r.allocatedhours || 0), 0)).toFixed(2));

    // Timesheet hours for the month (and by project)
    const { rows: tsRows } = await pool.query(
      `SELECT a.projectid, p.projectcode, SUM(te.hours) AS hours
       FROM timesheetentries te
       JOIN timesheets t ON t.timesheetid = te.timesheetid
       JOIN allocations a ON a.allocationid = te.allocationid
       JOIN projects p ON p.projectid = a.projectid
       WHERE t.employeeid = $1
         AND te.entrydate >= $2::date
         AND te.entrydate <  $3::date
         AND a.allocation_year = $4
         AND a.allocation_month = $5
       GROUP BY a.projectid, p.projectcode
       ORDER BY p.projectcode`,
      [employeeId, toISODate(start), toISODate(end), year, month]
    );
    const timesheetHours = Number((tsRows.reduce((s, r) => s + Number(r.hours || 0), 0)).toFixed(2));

    // By project join allocated/logged
    const allocByProject = new Map(allocRows.map(r => [String(r.projectid), Number(r.allocatedhours || 0)]));
    const byProject = tsRows.map(r => {
      const allocated = allocByProject.get(String(r.projectid)) || 0;
      const logged = Number(r.hours || 0);
      const utilRaw = allocated > 0 ? (logged / allocated) * 100 : (availableHours > 0 ? (logged / availableHours) * 100 : 0);
      const util = clampPct(utilRaw);
      return {
        projectCode: r.projectcode,
        allocated: Number(allocated.toFixed(2)),
        logged: Number(logged.toFixed(2)),
        utilizationPercent: Number(util.toFixed(2))
      };
    });

    // Optional weekly breakdown (sum of logged hours per week)
    let weekly = [];
    if (includeWeekly) {
      const { rows } = await pool.query(
        `WITH weeks AS (
           SELECT generate_series($1::date, ($2::date - INTERVAL '1 day')::date, interval '1 week')::date AS week_start
         )
         SELECT w.week_start,
                COALESCE(SUM(te.Hours),0) AS timesheet_hours
         FROM weeks w
         LEFT JOIN TimesheetEntries te ON te.EntryDate >= w.week_start
                                      AND te.EntryDate <  (w.week_start + INTERVAL '7 days')
         LEFT JOIN Timesheets t ON t.TimesheetID = te.TimesheetID AND t.EmployeeID = $3
         GROUP BY w.week_start
         ORDER BY w.week_start`,
        [toISODate(start), toISODate(end), employeeId]
      );
      weekly = rows.map(r => ({ weekStart: r.week_start, timesheetHours: Number(r.timesheet_hours) }));
    }

    // Calculate utilization based on yearly available hours
    const yearlyAvailableHours = getYearlyAvailableHours(emp.work_hours_per_week, year);
    const utilizationPercent = yearlyAvailableHours > 0 ? Number((clampPct((timesheetHours / yearlyAvailableHours) * 100)).toFixed(2)) : 0;

    return res.json({
      employeeId,
      name: emp.name,
      period: { year, month },
      availableHours,
      yearlyAvailableHours,
      allocatedHours,
      timesheetHours,
      utilizationPercent,
      byProject,
      weekly
    });
  } catch (err) {
    console.error('Employee dashboard error:', err);
    res.status(err.status || 500).json({ error: err.message || 'Failed to fetch employee dashboard' });
  }
});

// GET /api/dashboard/tribe?tribe=UKI|Non-UKI&year=YYYY&month=MM
router.get('/tribe', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
    const { year, month, start, end } = parsePeriod(req.query);
    const tribe = req.query.tribe;
    if (!['UKI', 'Non-UKI'].includes(tribe)) {
      const err = new Error('Invalid tribe'); err.status = 400; throw err;
    }

    // Employees in tribe (include team)
    const { rows: emps } = await pool.query(
      `SELECT EmployeeID, Name, COALESCE(WorkHoursPerWeek, 42.5) AS work_hours_per_week, COALESCE(Team,'') AS team
       FROM Employees WHERE Tribe = $1`,
      [tribe]
    );
    const empIds = emps.map(e => e.employeeid);
    const teamByEmp = new Map(emps.map(e => [e.employeeid, e.team]));

    const wd = countWeekdays(start, end);
    const availableByEmp = new Map(emps.map(e => [e.employeeid, Number(((e.work_hours_per_week/5.0)*wd).toFixed(2))]));

    // Projects touched by this tribe in the month
    // Priority: Use project's direct Tribe field if set, otherwise derive from employee allocations
    // Projects touched by this tribe in the month: derive from allocations in that month
    const { rows: projRows } = await pool.query(
        `
        SELECT projectid, projectcode
        FROM projects
        WHERE lower(tribe) = lower($1)
        ORDER BY projectcode
        `,
        [tribe]
      );


    // Allocated hours per (emp, project)
    const { rows: allocEP } = await pool.query(
      `SELECT a.employeeid, a.projectid, SUM(a.allocatedhours) AS allocated
       FROM allocations a
       WHERE a.employeeid = ANY($1::int[])
         AND a.allocation_year = $2
         AND a.allocation_month = $3
       GROUP BY a.employeeid, a.projectid`,
      [empIds, year, month]
    );
    const allocByEmpProj = new Map(allocEP.map(r => [`${r.employeeid}:${r.projectid}`, Number(r.allocated || 0)]));

    // Logged hours per (emp, project)
    const { rows: logEP } = await pool.query(
      `SELECT t.employeeid, a.projectid, SUM(te.hours) AS hours
       FROM timesheetentries te
       JOIN timesheets t ON t.timesheetid = te.timesheetid
       JOIN allocations a ON a.allocationid = te.allocationid
       WHERE t.employeeid = ANY($1::int[])
         AND te.entrydate >= $2::date AND te.entrydate < $3::date
         AND a.allocation_year = $4
         AND a.allocation_month = $5
       GROUP BY t.employeeid, a.projectid`,
      [empIds, toISODate(start), toISODate(end), year, month]
    );
    const loggedByEmpProj = new Map(logEP.map(r => [`${r.employeeid}:${r.projectid}`, Number(r.hours || 0)]));

    const teamOrder = ['Tribe Lead','PM','SA','BA','Developer'];
    const projects = projRows.map(pr => {
      // Build rows for employees who are allocated or logged on this project
      const empRows = emps.map(e => {
        const k = `${e.employeeid}:${pr.projectid}`;
        const allocated = allocByEmpProj.get(k) || 0;
        const logged = loggedByEmpProj.get(k) || 0;
        if (allocated === 0 && logged === 0) return null;
        const available = availableByEmp.get(e.employeeid) || 0;
        const util = available > 0 ? clampPct((logged/available)*100) : 0;
        return {
          employeeId: e.employeeid,
          name: e.name,
          team: teamByEmp.get(e.employeeid) || '',
          allocatedHours: Number(allocated.toFixed(2)),
          timesheetHours: Number(logged.toFixed(2)),
          utilizationPercent: Number(util.toFixed(2))
        };
      }).filter(Boolean);

      // Group by team
      const teamGroups = {};
      for (const r of empRows) {
        const t = r.team || 'Unknown';
        if (!teamGroups[t]) teamGroups[t] = [];
        teamGroups[t].push(r);
      }
      const teams = Object.keys(teamGroups).sort((a,b)=>teamOrder.indexOf(a)-teamOrder.indexOf(b)).map(t => {
        const list = teamGroups[t];
        const totals = list.reduce((acc, x) => ({
          allocatedHours: acc.allocatedHours + x.allocatedHours,
          timesheetHours: acc.timesheetHours + x.timesheetHours,
          availableHours: acc.availableHours + (availableByEmp.get(x.employeeId) || 0)
        }), { allocatedHours: 0, timesheetHours: 0, availableHours: 0});
        const util = totals.availableHours > 0 ? clampPct((totals.timesheetHours/totals.availableHours)*100) : 0;
        return { team: t, employees: list, totals: { ...totals, utilizationPercent: Number(util.toFixed(2)) } };
      });

      const totals = empRows.reduce((acc, x) => ({
        allocatedHours: acc.allocatedHours + x.allocatedHours,
        timesheetHours: acc.timesheetHours + x.timesheetHours,
        availableHours: acc.availableHours + (availableByEmp.get(x.employeeId) || 0)
      }), { allocatedHours: 0, timesheetHours: 0, availableHours: 0});
      const util = totals.availableHours > 0 ? clampPct((totals.timesheetHours/totals.availableHours)*100) : 0;

      return { projectId: pr.projectid, projectCode: pr.projectcode, teams, totals: { ...totals, utilizationPercent: Number(util.toFixed(2)) } };
    });

    // Tribe totals from all employees
    const rows = emps.map(e => {
      const availableHours = availableByEmp.get(e.employeeid) || 0;
      const yearlyAvailableHours = getYearlyAvailableHours(e.work_hours_per_week, year);
      const allocatedHours = allocEP.filter(a=>a.employeeid===e.employeeid).reduce((s,a)=>s+Number(a.allocated||0),0);
      const timesheetHours = logEP.filter(l=>l.employeeid===e.employeeid).reduce((s,l)=>s+Number(l.hours||0),0);
      const utilizationPercent = yearlyAvailableHours > 0 ? Number((clampPct((timesheetHours/yearlyAvailableHours)*100)).toFixed(2)) : 0;
      return { employeeId: e.employeeid, name: e.name, availableHours, yearlyAvailableHours, allocatedHours: Number(allocatedHours.toFixed(2)), timesheetHours: Number(timesheetHours.toFixed(2)), utilizationPercent };
    });

    const total = rows.reduce((acc, r) => {
      acc.availableHours += r.availableHours; acc.yearlyAvailableHours += r.yearlyAvailableHours; acc.allocatedHours += r.allocatedHours; acc.timesheetHours += r.timesheetHours; return acc;
    }, { availableHours: 0, yearlyAvailableHours: 0, allocatedHours: 0, timesheetHours: 0});
    const utilizationPercent = total.yearlyAvailableHours > 0 ? Number((clampPct((total.timesheetHours/total.yearlyAvailableHours)*100)).toFixed(2)) : 0;

    return res.json({ tribe, period: { year, month }, ...total, utilizationPercent, rows, projects });
  } catch (err) {
    console.error('Tribe dashboard error:', err);
    res.status(err.status || 500).json({ error: err.message || 'Failed to fetch tribe dashboard' });
  }
});

// GET /api/dashboard/team?team=PM|SA|BA|Developer|TribeLead&year=YYYY&month=MM
// GET /api/teams
router.get('/teams', authenticateToken, async (req, res) => {
  try {
    // Return distinct non-empty team names from Employees table
    const { rows } = await pool.query(
      `SELECT DISTINCT TRIM(Team) AS team FROM Employees WHERE COALESCE(Team,'') <> '' ORDER BY team`
    );
    const teams = (rows || []).map(r => r.team).filter(Boolean);
    return res.json({ teams });
  } catch (err) {
    console.error('Teams list error:', err);
    res.status(err.status || 500).json({ error: err.message || 'Failed to fetch teams' });
  }
});

router.get('/team', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
    const { year, month, start, end } = parsePeriod(req.query);
    const teamParam = String(req.query.team || '');
    // Accept any team string (dynamic teams stored in Employees.Team). Keep support
    // for the legacy "TribeLead" short token by mapping it to the stored value.
    // Trim and normalize the incoming team value so comparisons are robust.
    const team = (teamParam === 'TribeLead' ? 'Tribe Lead' : teamParam).trim();

    // Employees in team
    // Match team name case-insensitively and ignore whitespace differences
    // This allows matching 'TribeLead', 'Tribe Lead', ' tribe lead ' etc.
    const { rows: emps } = await pool.query(
      `SELECT EmployeeID, Name, COALESCE(WorkHoursPerWeek, 42.5) AS work_hours_per_week
       FROM Employees WHERE lower(regexp_replace(TRIM(Team), '\\s+', '', 'g')) = lower(regexp_replace($1, '\\s+', '', 'g'))`,
      [team]
    );
    const empIds = emps.map(e => e.employeeid);

    const wd = countWeekdays(start, end);
    const availableByEmp = new Map(emps.map(e => [e.employeeid, Number(((e.work_hours_per_week/5.0)*wd).toFixed(2))]));

    // Projects touched by this team in the month: derive from allocations in that month
    const { rows: projRows } = await pool.query(
      `SELECT DISTINCT p.projectid, p.projectcode
       FROM allocations a
       JOIN projects p ON p.projectid = a.projectid
       WHERE a.employeeid = ANY($1::int[])
         AND a.allocation_year = $2
         AND a.allocation_month = $3
       ORDER BY p.projectcode`,
      [empIds, year, month]
    );

    // Allocated hours per (emp, project) for the month
    const { rows: allocEP_local } = await pool.query(
      `SELECT a.employeeid, a.projectid, SUM(a.allocatedhours) AS allocated
       FROM allocations a
       WHERE a.employeeid = ANY($1::int[])
         AND a.allocation_year = $2
         AND a.allocation_month = $3
       GROUP BY a.employeeid, a.projectid`,
      [empIds, year, month]
    );
    const allocByEmpProj = new Map(allocEP_local.map(r => [`${r.employeeid}:${r.projectid}`, Number(r.allocated || 0)]));

    // Logged hours per (emp, project) for the month
    const { rows: logEP } = await pool.query(
      `SELECT t.employeeid, a.projectid, SUM(te.hours) AS hours
       FROM timesheetentries te
       JOIN timesheets t ON t.timesheetid = te.timesheetid
       JOIN allocations a ON a.allocationid = te.allocationid
       WHERE t.employeeid = ANY($1::int[])
         AND te.entrydate >= $2::date AND te.entrydate < $3::date
         AND a.allocation_year = $4
         AND a.allocation_month = $5
       GROUP BY t.employeeid, a.projectid`,
      [empIds, toISODate(start), toISODate(end), year, month]
    );
    const loggedByEmpProj = new Map(logEP.map(r => [`${r.employeeid}:${r.projectid}`, Number(r.hours || 0)]));

    const projects = projRows.map(pr => {
      const employees = emps.map(e => {
        const k = `${e.employeeid}:${pr.projectid}`;
        const allocated = allocByEmpProj.get(k) || 0;
        const logged = loggedByEmpProj.get(k) || 0;
        if (allocated === 0 && logged === 0) return null;
        const available = availableByEmp.get(e.employeeid) || 0;
        const util = available > 0 ? clampPct((logged/available)*100) : 0;
        return {
          employeeId: e.employeeid,
          name: e.name,
          allocatedHours: Number(allocated.toFixed(2)),
          timesheetHours: Number(logged.toFixed(2)),
          utilizationPercent: Number(util.toFixed(2))
        };
      }).filter(Boolean);

      const totals = employees.reduce((acc, x) => ({
        allocatedHours: acc.allocatedHours + x.allocatedHours,
        timesheetHours: acc.timesheetHours + x.timesheetHours
      }), { allocatedHours: 0, timesheetHours: 0});
      const util = totals.allocatedHours > 0 ? clampPct((totals.timesheetHours/totals.allocatedHours)*100) : 0;
      return { projectId: pr.projectid, projectCode: pr.projectcode, employees, totals: { ...totals, utilizationPercent: Number(util.toFixed(2)) } };
    });

    // Top-level totals (sum across employees)
    const rows = emps.map(e => {
      const availableHours = availableByEmp.get(e.employeeid) || 0;
      const allocatedHours = allocEP_local.filter(a=>a.employeeid===e.employeeid).reduce((s,a)=>s+Number(a.allocated||0),0);
      const timesheetHours = logEP.filter(l=>l.employeeid===e.employeeid).reduce((s,l)=>s+Number(l.hours||0),0);
      const utilizationPercent = availableHours > 0 ? Number(((timesheetHours/availableHours)*100).toFixed(2)) : 0;
      return { employeeId: e.employeeid, name: e.name, availableHours, allocatedHours: Number(allocatedHours.toFixed(2)), timesheetHours: Number(timesheetHours.toFixed(2)), utilizationPercent };
    });

    const total = rows.reduce((acc, r) => {
      acc.availableHours += r.availableHours; acc.allocatedHours += r.allocatedHours; acc.timesheetHours += r.timesheetHours; return acc;
    }, { availableHours: 0, allocatedHours: 0, timesheetHours: 0});
    const utilizationPercent = total.availableHours > 0 ? Number((clampPct((total.timesheetHours/total.availableHours)*100)).toFixed(2)) : 0;

    return res.json({ team: teamParam, period: { year, month }, ...total, utilizationPercent, rows, projects });
  } catch (err) {
    console.error('Team dashboard error:', err);
    res.status(err.status || 500).json({ error: err.message || 'Failed to fetch team dashboard' });
  }
});

export default router;