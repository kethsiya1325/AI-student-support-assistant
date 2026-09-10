/**
 * Memory Management System:
 * 1. Short-Term Conversational Memory (Multi-turn session history & context resolution)
 * 2. Long-Term Student Profile Memory (Persistent academic persona & personalization)
 */

// Predefined Demo Student Personas
export const DEFAULT_STUDENT_PROFILES = {
  'alex-cse-sem4': {
    id: 'alex-cse-sem4',
    name: 'Alex Chen',
    rollNumber: '21CS042',
    degree: 'B.Tech',
    department: 'Computer Science & Engineering',
    departmentCode: 'CSE',
    semester: 4,
    residence: 'Day Scholar',
    currentCgpa: 8.42,
    creditsEarned: 74,
    enrolledCourses: [
      { code: 'CS204', name: 'Operating Systems', credits: 4 },
      { code: 'CS205', name: 'Database Management Systems', credits: 4 },
      { code: 'CS201', name: 'Data Structures & Algorithms', credits: 4 },
      { code: 'MA202', name: 'Discrete Mathematics', credits: 4 }
    ],
    attendanceSnapshot: {
      'CS204': { attended: 36, total: 40, percentage: 90.0 },
      'CS205': { attended: 32, total: 40, percentage: 80.0 },
      'CS201': { attended: 29, total: 40, percentage: 72.5 }
    }
  },
  'priya-ece-sem4': {
    id: 'priya-ece-sem4',
    name: 'Priya Sharma',
    rollNumber: '21EC019',
    degree: 'B.Tech',
    department: 'Electronics & Communication Engineering',
    departmentCode: 'ECE',
    semester: 4,
    residence: 'Hosteller (Block B, Room 312)',
    currentCgpa: 8.85,
    creditsEarned: 76,
    enrolledCourses: [
      { code: 'EC201', name: 'Digital Signal Processing', credits: 4 },
      { code: 'EC202', name: 'Microprocessors & Microcontrollers', credits: 4 }
    ],
    attendanceSnapshot: {
      'EC201': { attended: 38, total: 42, percentage: 90.5 },
      'EC202': { attended: 35, total: 42, percentage: 83.3 }
    }
  },
  'rahul-cse-sem6': {
    id: 'rahul-cse-sem6',
    name: 'Rahul Nair',
    rollNumber: '20CS088',
    degree: 'B.Tech',
    department: 'Computer Science & Engineering',
    departmentCode: 'CSE',
    semester: 6,
    residence: 'Day Scholar',
    currentCgpa: 7.65,
    creditsEarned: 118,
    enrolledCourses: [
      { code: 'CS301', name: 'Artificial Intelligence & Machine Learning', credits: 4 }
    ],
    attendanceSnapshot: {
      'CS301': { attended: 31, total: 44, percentage: 70.4 }
    }
  }
};

class MemoryManager {
  constructor() {
    // In-memory conversation stores keyed by sessionId
    this.sessions = new Map();
    // Active student profile (defaults to Alex Chen)
    this.activeProfile = { ...DEFAULT_STUDENT_PROFILES['alex-cse-sem4'] };
    // Saved profiles catalog
    this.profiles = { ...DEFAULT_STUDENT_PROFILES };
  }

  /**
   * Get or create a session history
   */
  getSession(sessionId = 'default-session') {
    if (!this.sessions.has(sessionId)) {
      this.sessions.set(sessionId, {
        id: sessionId,
        createdAt: new Date().toISOString(),
        turns: [],
        entities: {
          lastMentionedCourse: null,
          lastMentionedClause: null,
          lastCalculatedGpa: null,
          lastAttendanceCheck: null
        }
      });
    }
    return this.sessions.get(sessionId);
  }

  /**
   * Add a turn to session memory
   */
  addTurn(sessionId, role, content, metadata = {}) {
    const session = this.getSession(sessionId);
    const turn = {
      role, // 'user' | 'assistant'
      content,
      timestamp: new Date().toISOString(),
      toolExecution: metadata.toolExecution || null,
      citations: metadata.citations || [],
      confidence: metadata.confidence || null
    };

    session.turns.push(turn);

    // Track recently mentioned entities for multi-turn resolution
    if (role === 'user' || role === 'assistant') {
      const courseMatch = content.match(/\b(CS\d{3}|EC\d{3}|MA\d{3})\b/i);
      if (courseMatch) {
        session.entities.lastMentionedCourse = courseMatch[1].toUpperCase();
      }
      const clauseMatch = content.match(/clause\s*(\d+(\.\d+)?)/i);
      if (clauseMatch) {
        session.entities.lastMentionedClause = `Clause ${clauseMatch[1]}`;
      }
    }

    if (metadata.toolExecution?.tool === 'calculate_gpa') {
      session.entities.lastCalculatedGpa = metadata.toolExecution.result;
    }
    if (metadata.toolExecution?.tool === 'check_attendance_eligibility') {
      session.entities.lastAttendanceCheck = metadata.toolExecution.result;
    }

    // Keep history manageable (last 16 messages)
    if (session.turns.length > 16) {
      session.turns = session.turns.slice(session.turns.length - 16);
    }

    return turn;
  }

  /**
   * Clear session memory
   */
  clearSession(sessionId = 'default-session') {
    if (this.sessions.has(sessionId)) {
      this.sessions.delete(sessionId);
    }
  }

  /**
   * Get active student profile
   */
  getActiveProfile() {
    return this.activeProfile;
  }

  /**
   * Switch or update the active student profile
   */
  setActiveProfile(profileOrId) {
    if (typeof profileOrId === 'string' && this.profiles[profileOrId]) {
      this.activeProfile = { ...this.profiles[profileOrId] };
    } else if (typeof profileOrId === 'object' && profileOrId !== null) {
      this.activeProfile = { ...this.activeProfile, ...profileOrId };
      if (profileOrId.id) {
        this.profiles[profileOrId.id] = { ...this.activeProfile };
      }
    }
    return this.activeProfile;
  }

  /**
   * Get all registered demo student profiles
   */
  getAllProfiles() {
    return Object.values(this.profiles);
  }

  /**
   * Format the student profile as context string for LLM prompts
   */
  getProfilePromptContext() {
    const p = this.activeProfile;
    return `[Active Student Profile Memory]
Student Name: ${p.name}
Roll Number: ${p.rollNumber}
Degree & Major: ${p.degree} in ${p.department} (${p.departmentCode})
Current Semester: Semester ${p.semester}
Residential Status: ${p.residence}
Current Academic Standing: CGPA ${p.currentCgpa}, Credits Earned: ${p.creditsEarned}
Enrolled Subjects This Semester: ${p.enrolledCourses?.map(c => `${c.code} (${c.name})`).join(', ') || 'N/A'}`;
  }

  /**
   * Resolve pronouns and context based on conversation history
   * e.g., if user says "What are its textbooks?" and last course was CS204, returns "What are its textbooks for CS204?"
   */
  resolveQueryContext(userQuery, sessionId) {
    const session = this.getSession(sessionId);
    let enrichedQuery = userQuery;
    const lower = userQuery.toLowerCase();

    // If query asks for subjects/courses without specifying dept/sem, contextualize with student profile
    if ((
      lower.includes('my subjects') || 
      lower.includes('my courses') || 
      lower.includes('what subjects do i have') || 
      lower.includes('what courses do i have') || 
      lower.includes('what are my courses') ||
      lower.includes('courses this semester') ||
      lower.includes('subjects this semester')
    ) && !lower.includes('cse') && !lower.includes('ece')) {
      enrichedQuery = `${userQuery} for ${this.activeProfile.departmentCode} Semester ${this.activeProfile.semester}`;
    }

    // If query uses pronouns ("it", "that course", "its units") and we have a lastMentionedCourse
    if (session.entities.lastMentionedCourse && (
      lower.includes(' it') || 
      lower.includes('its ') || 
      lower.includes('that course') || 
      lower.includes('this subject') ||
      lower.startsWith('what about') ||
      lower.startsWith('tell me more')
    )) {
      enrichedQuery = `${enrichedQuery} (referencing ${session.entities.lastMentionedCourse})`;
    }

    return enrichedQuery;
  }
}

export const memoryManager = new MemoryManager();
