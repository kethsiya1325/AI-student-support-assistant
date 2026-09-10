import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, '../../data');

// Grade Point Mapping (Autonomous University standard)
const GRADE_POINTS = {
  'O': 10,
  'A+': 9,
  'A': 8,
  'B+': 7,
  'B': 6,
  'C': 5,
  'F': 0,
  'SA': 0,
  'W': 0
};

/**
 * 1. Tool: calculate_gpa
 */
export function calculateGpa({ courses, previousCgpa, previousCredits }) {
  if (!courses || !Array.isArray(courses) || courses.length === 0) {
    return {
      error: "Please provide an array of courses with grade and credits. Example: [{ name: 'CS204', grade: 'A+', credits: 4 }]"
    };
  }

  let totalCredits = 0;
  let earnedCredits = 0;
  let totalGradePoints = 0;
  const breakdown = [];

  for (const course of courses) {
    const grade = (course.grade || '').toUpperCase().trim();
    const credits = Number(course.credits) || 0;
    const gradePoint = GRADE_POINTS.hasOwnProperty(grade) ? GRADE_POINTS[grade] : null;

    if (gradePoint === null) {
      return { error: `Invalid grade '${grade}' for course '${course.name || 'Unknown'}'. Valid grades: O, A+, A, B+, B, C, F.` };
    }

    const pointsEarned = credits * gradePoint;
    totalCredits += credits;
    if (gradePoint >= 5) {
      earnedCredits += credits;
    }
    totalGradePoints += pointsEarned;

    breakdown.push({
      course: course.name || course.code || 'Course',
      credits,
      grade,
      gradePoint,
      pointsEarned,
      status: gradePoint >= 5 ? 'Passed' : 'Arrear / Fail'
    });
  }

  const sgpa = totalCredits > 0 ? Number((totalGradePoints / totalCredits).toFixed(2)) : 0;

  let cumulativeResult = null;
  if (previousCgpa !== undefined && previousCredits !== undefined) {
    const prevC = Number(previousCredits) || 0;
    const prevGpa = Number(previousCgpa) || 0;
    const prevTotalPoints = prevC * prevGpa;
    const grandTotalCredits = prevC + totalCredits;
    const newCgpa = grandTotalCredits > 0 ? Number(((prevTotalPoints + totalGradePoints) / grandTotalCredits).toFixed(2)) : sgpa;
    cumulativeResult = {
      previousCredits: prevC,
      previousCgpa: prevGpa,
      totalCreditsAccumulated: grandTotalCredits,
      updatedCgpa: newCgpa
    };
  }

  let classification = "Second Class";
  if (sgpa >= 8.5) classification = "First Class with Distinction";
  else if (sgpa >= 6.5) classification = "First Class";
  else if (sgpa < 5.0) classification = "Needs Improvement / Below Passing Average";

  return {
    success: true,
    tool: 'calculate_gpa',
    totalCreditsOffered: totalCredits,
    totalCreditsEarned: earnedCredits,
    totalGradePoints,
    sgpa,
    classification,
    breakdown,
    cumulative: cumulativeResult,
    summary: `Semester SGPA: **${sgpa.toFixed(2)}** / 10.00 (${classification}). Earned ${earnedCredits} of ${totalCredits} credits.`
  };
}

/**
 * 2. Tool: check_attendance_eligibility
 */
export function checkAttendanceEligibility({ totalClasses, attendedClasses, courseName }) {
  const total = Number(totalClasses);
  const attended = Number(attendedClasses);

  if (isNaN(total) || isNaN(attended) || total <= 0 || attended < 0) {
    return {
      error: "Please provide valid positive numbers for totalClasses and attendedClasses."
    };
  }

  if (attended > total) {
    return {
      error: "Attended classes cannot be greater than total classes conducted."
    };
  }

  const percentage = Number(((attended / total) * 100).toFixed(2));
  let status = "";
  let eligible = false;
  let condonationPossible = false;
  let actionAdvice = "";
  let buffer = 0;
  let requiredToCatchUp = 0;

  if (percentage >= 75.0) {
    eligible = true;
    status = "Eligible for End-Semester Examinations";
    // How many classes can be safely missed?
    // attended / (total + y) >= 0.75  => y <= (attended / 0.75) - total
    buffer = Math.max(0, Math.floor((attended / 0.75) - total));
    actionAdvice = `Your attendance is in the safe zone. You can safely miss up to **${buffer}** upcoming class(es) while still remaining at or above the 75% threshold.`;
  } else if (percentage >= 65.0) {
    eligible = false;
    condonationPossible = true;
    status = "Shortage - Condonation Required (Clause 6.2)";
    // How many consecutive classes needed to reach 75%?
    // (attended + x) / (total + x) >= 0.75  => x = (0.75 * total - attended) / 0.25
    requiredToCatchUp = Math.ceil((0.75 * total - attended) / 0.25);
    actionAdvice = `You are currently in the condonation band (65%-74%). You must submit a medical certificate or duty certificate approved by the Dean of Academics with Rs. 1,000 fee. Alternatively, you must attend the next **${requiredToCatchUp}** consecutive class(es) without absenting to cross 75%.`;
  } else {
    eligible = false;
    condonationPossible = false;
    status = "Detained Due to Shortage (Clause 6.3 - SA Grade)";
    requiredToCatchUp = Math.ceil((0.75 * total - attended) / 0.25);
    actionAdvice = `Attendance is strictly below 65%. Per university regulations, condonation is NOT permitted. You will be categorized as SA (Shortage of Attendance) and detained from the end-semester exam. You must attend the next **${requiredToCatchUp}** consecutive classes to attain 75% if classes remain, or repeat the course.`;
  }

  return {
    success: true,
    tool: 'check_attendance_eligibility',
    course: courseName || 'General Semester Attendance',
    totalClasses: total,
    attendedClasses: attended,
    missedClasses: total - attended,
    percentage,
    status,
    eligible,
    condonationPossible,
    safeBunksAllowed: buffer,
    classesNeededFor75: requiredToCatchUp,
    actionAdvice,
    summary: `Attendance: **${percentage}%** (${attended}/${total} classes). Status: **${status}**.`
  };
}

/**
 * 3. Tool: search_academic_calendar
 */
export function searchAcademicCalendar({ query, category }) {
  try {
    const calPath = path.join(DATA_DIR, 'calendar.json');
    const calendar = JSON.parse(fs.readFileSync(calPath, 'utf8'));

    let results = calendar;
    if (category) {
      results = results.filter(item => item.category.toLowerCase() === category.toLowerCase());
    }

    if (query) {
      const q = query.toLowerCase();
      results = results.filter(item => 
        item.event.toLowerCase().includes(q) || 
        item.description.toLowerCase().includes(q) ||
        item.date.toLowerCase().includes(q)
      );
    }

    return {
      success: true,
      tool: 'search_academic_calendar',
      count: results.length,
      milestones: results,
      summary: results.length > 0
        ? `Found ${results.length} academic calendar milestone(s) matching your request.`
        : "No specific academic calendar dates matched your search."
    };
  } catch (err) {
    return { error: `Failed to load calendar: ${err.message}` };
  }
}

/**
 * 4. Tool: lookup_course_syllabus
 */
export function lookupCourseSyllabus({ courseCode, department, semester }) {
  try {
    const sylPath = path.join(DATA_DIR, 'syllabus.json');
    const syllabi = JSON.parse(fs.readFileSync(sylPath, 'utf8'));

    if (courseCode) {
      const code = courseCode.toUpperCase().replace(/\s+/g, '');
      const match = syllabi.find(c => c.courseCode.toUpperCase() === code || c.courseTitle.toLowerCase().includes(courseCode.toLowerCase()));
      if (match) {
        return {
          success: true,
          tool: 'lookup_course_syllabus',
          found: true,
          course: match,
          summary: `Syllabus for **${match.courseCode}: ${match.courseTitle}** (${match.credits} Credits, Dept: ${match.departmentCode}, Sem: ${match.semester}).`
        };
      }
    }

    // Filter by department and semester
    let filtered = syllabi;
    if (department) {
      filtered = filtered.filter(c => c.departmentCode.toUpperCase() === department.toUpperCase());
    }
    if (semester) {
      filtered = filtered.filter(c => c.semester === Number(semester));
    }

    return {
      success: true,
      tool: 'lookup_course_syllabus',
      found: filtered.length > 0,
      courses: filtered.map(c => ({
        courseCode: c.courseCode,
        courseTitle: c.courseTitle,
        credits: c.credits,
        department: c.departmentCode,
        semester: c.semester,
        prerequisites: c.prerequisites
      })),
      summary: `Found ${filtered.length} course(s) for ${department || 'any'} Semester ${semester || 'all'}.`
    };
  } catch (err) {
    return { error: `Failed to lookup syllabus: ${err.message}` };
  }
}

/**
 * 5. Tool: get_active_notices
 */
export function getActiveNotices({ department, urgency, keyword }) {
  try {
    const noticePath = path.join(DATA_DIR, 'notices.json');
    const notices = JSON.parse(fs.readFileSync(noticePath, 'utf8'));

    let results = notices;
    if (urgency) {
      results = results.filter(n => n.urgency.toLowerCase() === urgency.toLowerCase());
    }
    if (department && department !== 'All Departments') {
      results = results.filter(n => 
        n.department === 'All Departments' || 
        n.department.toLowerCase().includes(department.toLowerCase())
      );
    }
    if (keyword) {
      const k = keyword.toLowerCase();
      results = results.filter(n =>
        n.title.toLowerCase().includes(k) ||
        n.summary.toLowerCase().includes(k) ||
        n.tags.some(t => t.toLowerCase().includes(k))
      );
    }

    return {
      success: true,
      tool: 'get_active_notices',
      count: results.length,
      notices: results,
      summary: `Retrieved ${results.length} active university notice(s).`
    };
  } catch (err) {
    return { error: `Failed to fetch notices: ${err.message}` };
  }
}

/**
 * 6. Tool: faculty_directory_search
 */
export function facultyDirectorySearch({ name, department, subject }) {
  try {
    const facPath = path.join(DATA_DIR, 'faculty.json');
    const faculty = JSON.parse(fs.readFileSync(facPath, 'utf8'));

    let results = faculty;
    if (department) {
      results = results.filter(f => f.departmentCode.toUpperCase() === department.toUpperCase());
    }
    if (name) {
      const n = name.toLowerCase();
      results = results.filter(f => f.name.toLowerCase().includes(n));
    }
    if (subject) {
      const s = subject.toLowerCase();
      results = results.filter(f => f.specialization.toLowerCase().includes(s));
    }

    return {
      success: true,
      tool: 'faculty_directory_search',
      count: results.length,
      faculty: results,
      summary: `Found ${results.length} faculty member(s).`
    };
  } catch (err) {
    return { error: `Failed to search faculty: ${err.message}` };
  }
}

/**
 * Tool Registry and Intent Dispatcher
 */
export const TOOL_DEFINITIONS = [
  {
    name: 'calculate_gpa',
    description: 'Calculate Semester Grade Point Average (SGPA) and Cumulative GPA (CGPA) based on course grades and credit values.',
    parameters: {
      type: 'object',
      properties: {
        courses: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string', description: 'Course name or code' },
              grade: { type: 'string', description: 'Letter grade: O, A+, A, B+, B, C, F' },
              credits: { type: 'number', description: 'Course credits (e.g., 3, 4)' }
            },
            required: ['grade', 'credits']
          },
          description: 'List of courses taken in the semester'
        },
        previousCgpa: { type: 'number', description: 'Prior cumulative GPA before this semester' },
        previousCredits: { type: 'number', description: 'Total credits earned in prior semesters' }
      },
      required: ['courses']
    }
  },
  {
    name: 'check_attendance_eligibility',
    description: 'Calculate student attendance percentage and check eligibility for semester examinations under college regulations (Clause 6.1, 6.2, 6.3). Determines condonation eligibility or safe bunk margin.',
    parameters: {
      type: 'object',
      properties: {
        totalClasses: { type: 'number', description: 'Total number of lecture/lab classes conducted' },
        attendedClasses: { type: 'number', description: 'Number of classes attended by the student' },
        courseName: { type: 'string', description: 'Optional course name' }
      },
      required: ['totalClasses', 'attendedClasses']
    }
  },
  {
    name: 'search_academic_calendar',
    description: 'Retrieve dates for upcoming university examinations, fee deadlines, festivals, and academic events.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Keywords such as exam, fee, holiday, vacation' },
        category: { type: 'string', description: 'Category: Academic, Examinations, Deadlines, Events, Vacation' }
      }
    }
  },
  {
    name: 'lookup_course_syllabus',
    description: 'Lookup syllabus details, unit topics, textbooks, and prerequisites for college courses by course code (e.g., CS204) or department and semester.',
    parameters: {
      type: 'object',
      properties: {
        courseCode: { type: 'string', description: 'Course code like CS204, CS201, EC201' },
        department: { type: 'string', description: 'Department code: CSE, ECE, IT' },
        semester: { type: 'number', description: 'Semester number 1 to 8' }
      }
    }
  },
  {
    name: 'get_active_notices',
    description: 'Search official campus notices, circulars, and announcements with deadlines and urgency levels.',
    parameters: {
      type: 'object',
      properties: {
        department: { type: 'string', description: 'Filter by department' },
        urgency: { type: 'string', description: 'Urgent, High, Medium, Low' },
        keyword: { type: 'string', description: 'Search term like fee, hackathon, internship, exam' }
      }
    }
  },
  {
    name: 'faculty_directory_search',
    description: 'Search faculty members by name, department, or subject specialization to find office hours, cabin locations, and emails.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Faculty name' },
        department: { type: 'string', description: 'Department code: CSE, ECE' },
        subject: { type: 'string', description: 'Subject or research area' }
      }
    }
  }
];

/**
 * Execute tool by name
 */
export async function executeTool(name, args = {}) {
  switch (name) {
    case 'calculate_gpa':
      return calculateGpa(args);
    case 'check_attendance_eligibility':
      return checkAttendanceEligibility(args);
    case 'search_academic_calendar':
      return searchAcademicCalendar(args);
    case 'lookup_course_syllabus':
      return lookupCourseSyllabus(args);
    case 'get_active_notices':
      return getActiveNotices(args);
    case 'faculty_directory_search':
      return facultyDirectorySearch(args);
    default:
      return { error: `Tool '${name}' is not recognized.` };
  }
}

/**
 * Heuristic Tool Intent Detector (used for instant smart agent tool routing)
 */
export function detectToolIntent(userMessage, studentProfile = {}) {
  const text = userMessage.toLowerCase();

  // 1. Attendance Check Intent
  // e.g., "I attended 32 out of 45 classes, am I eligible?" or "check my attendance 38/50" or "attendance 70%"
  const attendPattern = /(?:attended|present)\s+(\d+)\s+(?:out\s+of|\/)\s+(\d+)/i;
  const matchAttend = text.match(attendPattern);
  if (matchAttend) {
    return {
      tool: 'check_attendance_eligibility',
      args: {
        attendedClasses: Number(matchAttend[1]),
        totalClasses: Number(matchAttend[2]),
        courseName: studentProfile.department ? `${studentProfile.department} Subject` : undefined
      }
    };
  }

  const attendAlt = /(\d+)\s*(?:classes|hours)?\s*(?:out of|\/)\s*(\d+)\s*(?:classes|hours)?/i;
  if (text.includes('attendance') || text.includes('eligible') || text.includes('bunk') || text.includes('condonation')) {
    const matchAlt = text.match(attendAlt);
    if (matchAlt) {
      const num1 = Number(matchAlt[1]);
      const num2 = Number(matchAlt[2]);
      const attended = Math.min(num1, num2);
      const total = Math.max(num1, num2);
      return {
        tool: 'check_attendance_eligibility',
        args: {
          attendedClasses: attended,
          totalClasses: total
        }
      };
    }
  }

  // 2. GPA Calculation Intent
  // e.g., "calculate my gpa: OS grade A+ (4 credits), DBMS grade O (4 credits), Algorithms grade A (4 credits)"
  if (text.includes('gpa') || text.includes('sgpa') || text.includes('cgpa') || text.includes('grade point')) {
    // Strip leading prompt prefix like "Calculate my GPA:" or "Compute SGPA:"
    const cleanInput = userMessage.replace(/^.*?(?:gpa|sgpa|cgpa)[:\s-]*/i, '');
    const items = cleanInput.split(/[,;\n]+/).map(s => s.trim()).filter(Boolean);
    const detectedCourses = [];

    for (const item of items) {
      const gradeMatch = item.match(/\b(A\+|B\+|[OABCF])(?![a-zA-Z0-9\+])/i);
      const creditMatch = item.match(/(\d+)\s*(?:credits?|cr)?/i);
      if (gradeMatch) {
        const grade = gradeMatch[1].toUpperCase();
        let credits = 4;
        if (creditMatch && creditMatch[1] !== '0') {
          credits = Number(creditMatch[1]);
        }
        let name = (item.slice(0, gradeMatch.index) + item.slice(gradeMatch.index + gradeMatch[0].length))
          .replace(/grade/gi, '')
          .replace(/\(?\d+\s*credits?\)?/gi, '')
          .replace(/[():=-]/g, '')
          .trim();
        if (!name || name.length < 2) name = `Subject ${detectedCourses.length + 1}`;
        detectedCourses.push({ name, grade, credits });
      }
    }

    if (detectedCourses.length > 0) {
      return {
        tool: 'calculate_gpa',
        args: { courses: detectedCourses }
      };
    }
  }

  // 3. Syllabus Course Lookup Intent
  // e.g. "What is the syllabus for CS204?" or "tell me about CS201"
  const courseCodeMatch = text.match(/\b(CS\d{3}|EC\d{3}|MA\d{3})\b/i);
  if (courseCodeMatch && (text.includes('syllabus') || text.includes('course') || text.includes('unit') || text.includes('topics') || text.includes('prerequisite') || text.includes('textbook'))) {
    return {
      tool: 'lookup_course_syllabus',
      args: {
        courseCode: courseCodeMatch[1].toUpperCase()
      }
    };
  }

  // 4. Academic Calendar Intent
  if (text.includes('when is') || text.includes('exam date') || text.includes('academic calendar') || text.includes('holiday') || text.includes('vacation starts') || text.includes('last working day')) {
    let category = null;
    if (text.includes('exam') || text.includes('test') || text.includes('cia')) category = 'Examinations';
    else if (text.includes('deadline') || text.includes('fee payment')) category = 'Deadlines';
    else if (text.includes('vacation')) category = 'Vacation';
    return {
      tool: 'search_academic_calendar',
      args: {
        query: text.replace(/(when is|when are|what date|what are the dates for)/gi, '').trim(),
        category
      }
    };
  }

  // 5. Active Notices Intent
  if (text.includes('notice') || text.includes('circular') || text.includes('announcement') || text.includes('deadline to pay exam fee') || text.includes('hackathon registration')) {
    let urgency = null;
    if (text.includes('urgent') || text.includes('emergency')) urgency = 'Urgent';
    return {
      tool: 'get_active_notices',
      args: {
        department: studentProfile.departmentCode || undefined,
        urgency,
        keyword: text.replace(/(what are the|any|show me|latest|active|notices|circulars)/gi, '').trim()
      }
    };
  }

  // 6. Faculty Directory Intent
  if (text.includes('office hours') || text.includes('faculty') || text.includes('professor') || text.includes('cabin') || text.includes('dean')) {
    return {
      tool: 'faculty_directory_search',
      args: {
        department: studentProfile.departmentCode || undefined,
        name: text.replace(/(who is|contact|office hours|cabin of|professor|dr\.|prof\.)/gi, '').trim()
      }
    };
  }

  return null;
}
