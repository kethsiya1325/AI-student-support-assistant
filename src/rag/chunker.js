import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, '../../data');

/**
 * Loads all JSON documents from the data directory and produces structured RAG chunks
 * with normalized metadata and searchable text tokens.
 */
export function buildDocumentChunks() {
  const chunks = [];

  // 1. Process Regulations
  try {
    const regPath = path.join(DATA_DIR, 'regulations.json');
    if (fs.existsSync(regPath)) {
      const regulations = JSON.parse(fs.readFileSync(regPath, 'utf8'));
      for (const reg of regulations) {
        chunks.push({
          id: `chunk-reg-${reg.id}`,
          docId: reg.id,
          category: 'regulations',
          source: `Academic Regulations (${reg.clause})`,
          title: `${reg.clause}: ${reg.title}`,
          department: 'All Departments',
          semester: 'All Semesters',
          text: `[Academic Regulation - ${reg.clause} - ${reg.title}]\n${reg.content}\nTags: ${reg.tags.join(', ')}`,
          raw: reg,
          tags: reg.tags || []
        });
      }
    }
  } catch (err) {
    console.error('Error loading regulations:', err);
  }

  // 2. Process Syllabus (both course overview and individual units for precision)
  try {
    const sylPath = path.join(DATA_DIR, 'syllabus.json');
    if (fs.existsSync(sylPath)) {
      const syllabi = JSON.parse(fs.readFileSync(sylPath, 'utf8'));
      for (const course of syllabi) {
        // Course Overview Chunk
        chunks.push({
          id: `chunk-syl-overview-${course.courseCode}`,
          docId: course.id,
          category: 'syllabus',
          source: `Curriculum: ${course.courseCode} ${course.courseTitle}`,
          title: `${course.courseCode}: ${course.courseTitle} (Overview & Credits)`,
          department: course.departmentCode,
          semester: course.semester,
          text: `Course Code: ${course.courseCode}\nCourse Title: ${course.courseTitle}\nDepartment: ${course.department} (${course.departmentCode})\nSemester: ${course.semester}\nCredits: ${course.credits} (L-T-P-C: ${course.lectureTutorialPractical})\nPrerequisites: ${course.prerequisites.join(', ')}\nOverview: ${course.overview}\nTextbooks:\n${course.textbooks.map((tb, i) => `${i + 1}. ${tb}`).join('\n')}\nReference Books:\n${course.referenceBooks.map((rb, i) => `${i + 1}. ${rb}`).join('\n')}`,
          raw: course,
          tags: course.tags || []
        });

        // Individual Unit Chunks
        for (const unit of course.units) {
          chunks.push({
            id: `chunk-syl-${course.courseCode}-unit-${unit.unitNumber}`,
            docId: course.id,
            category: 'syllabus',
            source: `${course.courseCode} - Unit ${unit.unitNumber}`,
            title: `${course.courseCode} ${course.courseTitle} - Unit ${unit.unitNumber}: ${unit.title}`,
            department: course.departmentCode,
            semester: course.semester,
            text: `Course: ${course.courseCode} ${course.courseTitle} (Semester ${course.semester}, Dept: ${course.departmentCode})\nUnit ${unit.unitNumber}: ${unit.title}\nTopics Covered: ${unit.topics}\nRecommended Textbooks: ${course.textbooks[0] || 'Standard Text'}`,
            raw: { ...course, unit },
            tags: [...(course.tags || []), `unit ${unit.unitNumber}`, unit.title.toLowerCase()]
          });
        }
      }
    }
  } catch (err) {
    console.error('Error loading syllabus:', err);
  }

  // 3. Process FAQs
  try {
    const faqPath = path.join(DATA_DIR, 'faqs.json');
    if (fs.existsSync(faqPath)) {
      const faqs = JSON.parse(fs.readFileSync(faqPath, 'utf8'));
      for (const faq of faqs) {
        chunks.push({
          id: `chunk-faq-${faq.id}`,
          docId: faq.id,
          category: 'faqs',
          source: `Student FAQ (${faq.section})`,
          title: faq.question,
          department: 'All Departments',
          semester: 'All Semesters',
          text: `[FAQ - ${faq.section}]\nQuestion: ${faq.question}\nAnswer: ${faq.answer}\nTags: ${faq.tags.join(', ')}`,
          raw: faq,
          tags: faq.tags || []
        });
      }
    }
  } catch (err) {
    console.error('Error loading faqs:', err);
  }

  // 4. Process Notices
  try {
    const noticePath = path.join(DATA_DIR, 'notices.json');
    if (fs.existsSync(noticePath)) {
      const notices = JSON.parse(fs.readFileSync(noticePath, 'utf8'));
      for (const notice of notices) {
        chunks.push({
          id: `chunk-not-${notice.id}`,
          docId: notice.id,
          category: 'notices',
          source: `Official Circular (${notice.noticeNumber})`,
          title: notice.title,
          department: notice.department,
          semester: 'All Semesters',
          text: `[Campus Notice - ${notice.noticeNumber}]\nTitle: ${notice.title}\nDate: ${notice.datePublished} | Urgency: ${notice.urgency}\nDepartment Scope: ${notice.department}\nSummary: ${notice.summary}\nAction Required: ${notice.actionRequired}\nTags: ${notice.tags.join(', ')}`,
          raw: notice,
          tags: notice.tags || []
        });
      }
    }
  } catch (err) {
    console.error('Error loading notices:', err);
  }

  // 5. Process Academic Calendar
  try {
    const calPath = path.join(DATA_DIR, 'calendar.json');
    if (fs.existsSync(calPath)) {
      const calendar = JSON.parse(fs.readFileSync(calPath, 'utf8'));
      for (let i = 0; i < calendar.length; i++) {
        const item = calendar[i];
        chunks.push({
          id: `chunk-cal-${i + 1}`,
          docId: `CAL-${i + 1}`,
          category: 'calendar',
          source: `Academic Calendar 2026`,
          title: `${item.event} (${item.date})`,
          department: 'All Departments',
          semester: 'All Semesters',
          text: `[Academic Calendar Milestone]\nEvent: ${item.event}\nDate / Window: ${item.date}\nCategory: ${item.category}\nDescription: ${item.description}`,
          raw: item,
          tags: ['calendar', 'date', 'deadline', item.event.toLowerCase(), item.category.toLowerCase()]
        });
      }
    }
  } catch (err) {
    console.error('Error loading calendar:', err);
  }

  // 6. Process Faculty Directory
  try {
    const facPath = path.join(DATA_DIR, 'faculty.json');
    if (fs.existsSync(facPath)) {
      const faculty = JSON.parse(fs.readFileSync(facPath, 'utf8'));
      for (const fac of faculty) {
        chunks.push({
          id: `chunk-fac-${fac.id}`,
          docId: fac.id,
          category: 'faculty',
          source: `Faculty Directory (${fac.departmentCode})`,
          title: `${fac.name} - ${fac.designation}`,
          department: fac.departmentCode,
          semester: 'All Semesters',
          text: `[Faculty Directory]\nName: ${fac.name}\nDesignation: ${fac.designation}\nDepartment: ${fac.department} (${fac.departmentCode})\nCabin / Location: ${fac.cabin}\nOffice Hours: ${fac.officeHours}\nEmail: ${fac.email}\nSpecialization: ${fac.specialization}`,
          raw: fac,
          tags: ['faculty', 'professor', fac.name.toLowerCase(), fac.departmentCode.toLowerCase(), 'office hours']
        });
      }
    }
  } catch (err) {
    console.error('Error loading faculty:', err);
  }

  return chunks;
}
