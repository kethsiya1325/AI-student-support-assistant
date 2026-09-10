import dotenv from 'dotenv';
import { ragEngine } from '../rag/index.js';
import { executeTool, detectToolIntent } from '../tools/index.js';
import { memoryManager } from '../memory/index.js';

dotenv.config();

/**
 * Clean and summarize retrieved text for synthesized answers
 */
function buildLocalSynthesizedResponse(userMessage, studentProfile, ragResults, toolResult, session) {
  let responseText = "";

  // 1. If tool was executed, lead with the tool's verified result
  if (toolResult && toolResult.success) {
    if (toolResult.tool === 'check_attendance_eligibility') {
      const { percentage, status, eligible, condonationPossible, safeBunksAllowed, classesNeededFor75, actionAdvice } = toolResult;
      responseText += `### 📊 Attendance Verification Result\n\n`;
      responseText += `- **Current Attendance**: **${percentage}%** (${toolResult.attendedClasses} attended out of ${toolResult.totalClasses} classes conducted)\n`;
      responseText += `- **Official Status**: **${status}**\n\n`;

      if (eligible) {
        responseText += `> [!NOTE]\n> ✅ **You are eligible to appear for the End-Semester Examinations.** Your attendance exceeds the mandatory 75% threshold (Clause 6.1).\n\n`;
        responseText += `💡 **Buffer Margin**: ${actionAdvice}\n\n`;
      } else if (condonationPossible) {
        responseText += `> [!WARNING]\n> ⚠️ **Attendance Shortage Alert**: You are in the condonation bracket (65% – 74%). Under **Regulation Clause 6.2**, you will not be issued a hall ticket directly unless condoned on certified medical or duty grounds by the Dean of Academics.\n\n`;
        responseText += `📌 **Action Required**:\n- Submit medical/duty certificates at least 7 days before exams.\n- Prescribed condonation fee: **Rs. 1,000 per subject**.\n- ${actionAdvice}\n\n`;
      } else {
        responseText += `> [!CAUTION]\n> 🛑 **Detention Notice (Grade SA)**: Your attendance is strictly below 65%. Per **Clause 6.3**, condonation is not permitted. You are detained from writing the end-semester examination and must re-register for this course.\n\n`;
      }

      // Add related regulation citation
      const regChunk = ragResults.find(r => r.category === 'regulations');
      if (regChunk) {
        responseText += `**Governing Regulation Reference**:\n> ${regChunk.title}: *${regChunk.text.slice(0, 240)}...*\n\n`;
      }

      return responseText;
    }

    if (toolResult.tool === 'calculate_gpa') {
      const { sgpa, classification, totalCreditsOffered, totalCreditsEarned, breakdown, cumulative } = toolResult;
      responseText += `### 🎓 Grade Point Average (GPA) Computation\n\n`;
      responseText += `Based on the university's 10-point absolute grading scale (**Clause 4.1 & 4.2**):\n\n`;
      responseText += `| Course | Credits | Grade | Grade Point | Points Earned | Status |\n`;
      responseText += `| :--- | :---: | :---: | :---: | :---: | :---: |\n`;
      for (const row of breakdown) {
        responseText += `| ${row.course} | ${row.credits} | **${row.grade}** | ${row.gradePoint} | ${row.pointsEarned} | ${row.status} |\n`;
      }
      responseText += `\n`;
      responseText += `**Summary**:\n`;
      responseText += `- **Total Credits Evaluated**: ${totalCreditsOffered}\n`;
      responseText += `- **Total Credits Earned**: ${totalCreditsEarned}\n`;
      responseText += `- **Semester SGPA**: **\`${sgpa.toFixed(2)}\` / 10.00**\n`;
      responseText += `- **Academic Standing**: **${classification}**\n\n`;

      if (cumulative) {
        responseText += `**Cumulative CGPA Update**:\n`;
        responseText += `- Cumulative Credits: **${cumulative.totalCreditsAccumulated}**\n`;
        responseText += `- Updated CGPA: **\`${cumulative.updatedCgpa.toFixed(2)}\` / 10.00**\n\n`;
      }

      return responseText;
    }

    if (toolResult.tool === 'lookup_course_syllabus') {
      if (toolResult.course) {
        const c = toolResult.course;
        responseText += `### 📘 ${c.courseCode}: ${c.courseTitle}\n\n`;
        responseText += `- **Department**: ${c.department} (${c.departmentCode})\n`;
        responseText += `- **Semester**: Semester ${c.semester}\n`;
        responseText += `- **Credits**: ${c.credits} (Lecture-Tutorial-Practical: ${c.lectureTutorialPractical})\n`;
        responseText += `- **Prerequisites**: ${c.prerequisites.join(', ')}\n\n`;
        responseText += `**Course Overview**:\n${c.overview}\n\n`;
        responseText += `#### 📋 Syllabus by Units\n`;
        for (const unit of c.units) {
          responseText += `**Unit ${unit.unitNumber}: ${unit.title}**\n- ${unit.topics}\n\n`;
        }
        responseText += `#### 📚 Recommended Textbooks\n`;
        for (let i = 0; i < c.textbooks.length; i++) {
          responseText += `${i + 1}. ${c.textbooks[i]}\n`;
        }
        return responseText;
      } else if (toolResult.courses) {
        responseText += `### 📚 Department Courses (${studentProfile.departmentCode || 'All'}, Semester ${studentProfile.semester || 'Current'})\n\n`;
        for (const c of toolResult.courses) {
          responseText += `- **${c.courseCode}**: ${c.courseTitle} (${c.credits} Credits, Dept: ${c.department})\n`;
        }
        return responseText;
      }
    }

    if (toolResult.tool === 'search_academic_calendar') {
      if (toolResult.milestones && toolResult.milestones.length > 0) {
        responseText += `### 📅 Academic Calendar Schedule & Milestones\n\n`;
        for (const m of toolResult.milestones) {
          responseText += `- **${m.event}**\n  - 🗓️ Date: **${m.date}**\n  - 📌 Category: ${m.category}\n  - ℹ️ Details: ${m.description}\n\n`;
        }
        return responseText;
      }
      // If 0 calendar items, fall through to RAG which might have specific notices/regulations
    }

    if (toolResult.tool === 'get_active_notices') {
      if (toolResult.notices && toolResult.notices.length > 0) {
        responseText += `### 📢 Official College Circulars & Notices\n\n`;
        for (const n of toolResult.notices) {
          const urgencyBadge = n.urgency === 'Urgent' ? '🔴 **[URGENT]**' : n.urgency === 'High' ? '🟠 **[HIGH]**' : '🔵 **[NOTICE]**';
          responseText += `#### ${urgencyBadge} ${n.title}\n`;
          responseText += `- **Circular No**: \`${n.noticeNumber}\` | **Date**: ${n.datePublished}\n`;
          responseText += `- **Applies To**: ${n.department}\n`;
          responseText += `- **Summary**: ${n.summary}\n`;
          responseText += `- **Action Required**: 👉 *${n.actionRequired}*\n\n`;
        }
        return responseText;
      }
      // If 0 notices, fall through to RAG
    }

    if (toolResult.tool === 'faculty_directory_search') {
      responseText += `### 👨‍🏫 Faculty Directory & Office Hours\n\n`;
      for (const f of toolResult.faculty) {
        responseText += `#### ${f.name} (${f.designation})\n`;
        responseText += `- **Department**: ${f.department} (${f.departmentCode})\n`;
        responseText += `- **Cabin / Office**: ${f.cabin}\n`;
        responseText += `- **Office Hours**: 🕒 **${f.officeHours}**\n`;
        responseText += `- **Email**: [${f.email}](mailto:${f.email})\n`;
        responseText += `- **Specialization**: ${f.specialization}\n\n`;
      }
      return responseText;
    }
  }

  // 2. Synthesize using Top RAG Results
  if (ragResults && ragResults.length > 0) {
    const top = ragResults[0];

    // Regulations Query
    if (top.category === 'regulations') {
      responseText += `### 📜 ${top.title}\n\n`;
      responseText += `${top.raw?.content || top.text}\n\n`;
      responseText += `> **Source**: *${top.source}*\n\n`;

      if (ragResults.length > 1 && ragResults[1].category === 'regulations') {
        const second = ragResults[1];
        responseText += `#### Related Provision: ${second.title}\n`;
        responseText += `${second.raw?.content || second.text}\n\n`;
      }
      return responseText;
    }

    // FAQs Query
    if (top.category === 'faqs') {
      responseText += `### ℹ️ ${top.raw?.question || top.title}\n\n`;
      responseText += `${top.raw?.answer || top.text}\n\n`;
      responseText += `> **Department / Section**: ${top.raw?.section || 'Campus Administration'}\n\n`;

      if (ragResults.length > 1 && ragResults[1].category === 'faqs') {
        responseText += `**Also Related**:\n- **${ragResults[1].title}**: ${ragResults[1].raw?.answer?.slice(0, 180)}...\n\n`;
      }
      return responseText;
    }

    // Notices Query
    if (top.category === 'notices') {
      const n = top.raw;
      responseText += `### 📢 ${n.title}\n\n`;
      responseText += `- **Circular Number**: \`${n.noticeNumber}\`\n`;
      responseText += `- **Published**: ${n.datePublished} | **Priority**: **${n.urgency}**\n`;
      responseText += `- **Target**: ${n.department}\n\n`;
      responseText += `${n.summary}\n\n`;
      responseText += `> [!IMPORTANT]\n> **Action Required**: ${n.actionRequired}\n\n`;
      return responseText;
    }

    // Syllabus Query
    if (top.category === 'syllabus') {
      responseText += `### 📖 ${top.title}\n\n`;
      responseText += `${top.text}\n\n`;
      return responseText;
    }

    // General match
    responseText += `### 💡 College Information\n\n`;
    responseText += `${top.text}\n\n`;
    return responseText;
  }

  // Fallback if no specific doc match
  responseText = `Hello **${studentProfile.name || 'Student'}**! I am your AI Student Support Assistant.\n\nI can help you with:\n1. **Academic Regulations** (Grading scales, 75% attendance rule, condonation, passing criteria, revaluation)\n2. **Curriculum & Syllabus** (Course codes, weekly topics, textbooks for CSE, ECE, etc.)\n3. **Campus FAQs** (Hostel curfew, mess rebate, library books & fines, Wi-Fi login, bonafide certificates)\n4. **Notices & Circulars** (Exam schedules, fee deadlines, hackathons, internships)\n5. **Interactive Tools** (Calculate your SGPA/CGPA or check your exam attendance eligibility)\n\nCould you please specify your question, course code, or topic?`;

  return responseText;
}

/**
 * Main Assistant Service coordinating RAG, Tools, Memory, and LLMs
 */
export async function processStudentMessage({ message, sessionId = 'default-session', activeProfileId = null }) {
  // 1. Resolve student profile from memory
  if (activeProfileId) {
    memoryManager.setActiveProfile(activeProfileId);
  }
  const studentProfile = memoryManager.getActiveProfile();

  // 2. Resolve query context using short-term conversation memory
  const contextualQuery = memoryManager.resolveQueryContext(message, sessionId);

  // 3. Detect and Execute Agent Tools if needed
  let toolExecution = null;
  const detectedIntent = detectToolIntent(message, studentProfile);

  if (detectedIntent) {
    const result = await executeTool(detectedIntent.tool, detectedIntent.args);
    toolExecution = {
      tool: detectedIntent.tool,
      args: detectedIntent.args,
      result
    };
  }

  // 4. Retrieve RAG Knowledge Base Chunks
  const ragResults = ragEngine.search(contextualQuery, {
    topK: 4,
    department: studentProfile.departmentCode,
    semester: studentProfile.semester
  });

  // 5. Generate Response via Live Gemini API if available, else Local Semantic Agent
  const apiKey = process.env.GEMINI_API_KEY;
  let finalAnswer = "";
  let modelUsed = "local-semantic-agent";

  if (apiKey && apiKey.trim().length > 10) {
    try {
      // Direct call to Google Gemini REST endpoint (v1beta)
      const modelName = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
      const promptContext = ragEngine.formatContextForPrompt(ragResults);
      const profileContext = memoryManager.getProfilePromptContext();
      const session = memoryManager.getSession(sessionId);

      const systemInstruction = `You are the official AI Student Support Assistant for an autonomous engineering university.
Your role is to assist students accurately with university regulations, curricula/syllabus, college life FAQs, and active circulars/notices.
Strictly ground your answers on the provided University Knowledge Base citations.
If relevant tools were executed, incorporate their exact figures.
Student Profile:\n${profileContext}
Tone: Supportive, professional, accurate, and concise. Use markdown tables and alerts when helpful.`;

      let toolSnippet = "";
      if (toolExecution) {
        toolSnippet = `\n[Agent Tool Result for '${toolExecution.tool}']:\n${JSON.stringify(toolExecution.result, null, 2)}\n`;
      }

      const contents = [
        ...session.turns.slice(-4).map(t => ({
          role: t.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: t.content }]
        })),
        {
          role: 'user',
          parts: [
            {
              text: `Student Question: "${message}"\n\n` +
                `Contextual Query: "${contextualQuery}"\n\n` +
                `Knowledge Base Context:\n${promptContext}\n` +
                toolSnippet +
                `\nPlease provide a clear, well-structured response addressing the student's question, citing clauses or official documents where appropriate.`
            }
          ]
        }
      ];

      const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemInstruction }] },
          contents,
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 1024
          }
        })
      });

      if (response.ok) {
        const data = await response.json();
        const candidate = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (candidate) {
          finalAnswer = candidate;
          modelUsed = modelName;
        }
      } else {
        const errText = await response.text();
        console.warn('Gemini API call failed, falling back to local agent:', errText);
      }
    } catch (err) {
      console.warn('Gemini invocation error, using local agent:', err.message);
    }
  }

  // Fallback to our intelligent built-in local semantic agent
  if (!finalAnswer) {
    const session = memoryManager.getSession(sessionId);
    finalAnswer = buildLocalSynthesizedResponse(message, studentProfile, ragResults, toolExecution?.result, session);
    modelUsed = "local-semantic-agent";
  }

  // 6. Extract formatted citations
  const citations = ragResults.map(r => ({
    id: r.id,
    docId: r.docId,
    title: r.title,
    source: r.source,
    category: r.category,
    department: r.department,
    semester: r.semester,
    score: r.score,
    confidence: r.confidence,
    preview: r.text.slice(0, 160) + '...'
  }));

  // 7. Record Turn in Memory
  memoryManager.addTurn(sessionId, 'user', message);
  memoryManager.addTurn(sessionId, 'assistant', finalAnswer, {
    toolExecution,
    citations,
    modelUsed
  });

  return {
    response: finalAnswer,
    toolExecution,
    citations,
    studentProfile,
    modelUsed,
    sessionId
  };
}
