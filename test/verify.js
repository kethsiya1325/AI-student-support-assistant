import { ragEngine } from '../src/rag/index.js';
import { executeTool, detectToolIntent } from '../src/tools/index.js';
import { memoryManager } from '../src/memory/index.js';
import { processStudentMessage } from '../src/services/llm.js';

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✅ PASS: ${message}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${message}`);
    failed++;
  }
}

async function runTests() {
  console.log('\n========================================');
  console.log('🧪 Starting AI Student Support Assistant Tests');
  console.log('========================================\n');

  // --- TEST SUITE 1: RAG ENGINE ---
  console.log('📚 Test Suite 1: RAG Search Engine');
  
  const regResults = ragEngine.search('What is the minimum attendance required for semester exams?');
  assert(regResults.length > 0, 'RAG retrieves chunks for attendance query');
  assert(regResults[0].title.includes('Clause 6.1') || regResults[0].title.includes('Attendance'), 'Top chunk references attendance regulation (Clause 6.1)');
  assert(regResults[0].confidence > 50, `High confidence score: ${regResults[0].confidence}%`);

  const sylResults = ragEngine.search('What are the topics in Unit 3 of CS204?');
  assert(sylResults.length > 0, 'RAG retrieves chunks for CS204 Unit 3 query');
  assert(sylResults[0].title.includes('CS204') && sylResults[0].title.includes('Unit 3'), 'Top chunk accurately retrieves CS204 Unit 3');

  const wifiResults = ragEngine.search('How do I connect to campus wifi?');
  assert(wifiResults.length > 0, 'RAG retrieves FAQ for wifi connection');
  assert(wifiResults[0].category === 'faqs', 'Category is correctly identified as FAQs');

  const feeNoticeResults = ragEngine.search('When is the last date to pay exam fees?');
  assert(feeNoticeResults.length > 0, 'RAG retrieves circular for exam fees');
  assert(feeNoticeResults[0].raw?.noticeNumber?.includes('COE/FEE') || feeNoticeResults[0].title.toLowerCase().includes('fee'), 'Notice references exam fee deadline');

  // --- TEST SUITE 2: AGENT TOOLS ---
  console.log('\n🛠️ Test Suite 2: Agent Tools Engine');

  // Tool 1: Attendance Checker (Safe)
  const safeAttend = await executeTool('check_attendance_eligibility', { totalClasses: 50, attendedClasses: 45 });
  assert(safeAttend.success === true, 'Attendance tool executed successfully');
  assert(safeAttend.percentage === 90, 'Attendance computed correctly as 90%');
  assert(safeAttend.eligible === true, 'Student with 90% marked eligible');
  assert(safeAttend.safeBunksAllowed === 10, 'Safe bunks calculated as 10 classes');

  // Tool 1: Attendance Checker (Condonation)
  const condonAttend = await executeTool('check_attendance_eligibility', { totalClasses: 45, attendedClasses: 32 });
  assert(condonAttend.percentage === 71.11, 'Attendance computed correctly as 71.11%');
  assert(condonAttend.eligible === false && condonAttend.condonationPossible === true, 'Flagged for condonation under Clause 6.2');
  assert(condonAttend.classesNeededFor75 > 0, `Requires ${condonAttend.classesNeededFor75} classes to cross 75%`);

  // Tool 1: Attendance Checker (Detention)
  const detainedAttend = await executeTool('check_attendance_eligibility', { totalClasses: 40, attendedClasses: 22 });
  assert(detainedAttend.percentage === 55, 'Attendance computed as 55%');
  assert(detainedAttend.condonationPossible === false, 'Detained student not eligible for condonation');

  // Tool 2: GPA Calculator
  const gpaResult = await executeTool('calculate_gpa', {
    courses: [
      { name: 'Operating Systems', grade: 'O', credits: 4 },
      { name: 'Database Systems', grade: 'A+', credits: 4 },
      { name: 'Discrete Math', grade: 'A', credits: 4 }
    ]
  });
  assert(gpaResult.success === true, 'GPA tool executed successfully');
  // (4*10 + 4*9 + 4*8) / 12 = (40 + 36 + 32) / 12 = 108 / 12 = 9.00
  assert(gpaResult.sgpa === 9.00, `SGPA exactly matches expected 9.00 (Got ${gpaResult.sgpa})`);
  assert(gpaResult.classification === 'First Class with Distinction', 'Awarded First Class with Distinction');

  // Tool 3: Intent Detection
  const intent1 = detectToolIntent('I attended 32 out of 45 classes, am I eligible?');
  assert(intent1 !== null && intent1.tool === 'check_attendance_eligibility', 'Detected attendance tool intent');
  assert(intent1.args.attendedClasses === 32 && intent1.args.totalClasses === 45, 'Parsed attended and total classes from message');

  // --- TEST SUITE 3: MEMORY SYSTEM ---
  console.log('\n🧠 Test Suite 3: Memory System');

  const testSession = 'test-session-1';
  memoryManager.clearSession(testSession);
  const profile = memoryManager.getActiveProfile();
  assert(profile.name === 'Alex Chen', 'Default profile is Alex Chen');
  assert(profile.departmentCode === 'CSE', 'Default department is CSE');

  // Query enrichment using memory
  const enriched = memoryManager.resolveQueryContext('What courses do I have this semester?', testSession);
  assert(enriched.includes('CSE') && enriched.includes('4'), `Enriched query with student profile context: "${enriched}"`);

  // Multi-turn pronoun resolution
  memoryManager.addTurn(testSession, 'user', 'Tell me about CS204');
  memoryManager.addTurn(testSession, 'assistant', 'CS204 is Operating Systems.');
  const followUpEnriched = memoryManager.resolveQueryContext('What are its textbooks?', testSession);
  assert(followUpEnriched.includes('CS204'), `Resolved pronoun "its" to CS204: "${followUpEnriched}"`);

  // --- TEST SUITE 4: END-TO-END CHAT PIPELINE ---
  console.log('\n💬 Test Suite 4: End-to-End Chat Pipeline');

  const chatRes1 = await processStudentMessage({
    message: 'What is the minimum attendance required for semester exams and can it be condoned?',
    sessionId: testSession
  });
  assert(chatRes1.response.length > 50, 'Generated comprehensive assistant response');
  assert(chatRes1.citations.length > 0, 'Included RAG citations in response');

  const chatRes2 = await processStudentMessage({
    message: 'I attended 32 out of 45 classes, am I eligible?',
    sessionId: testSession
  });
  assert(chatRes2.toolExecution !== null, 'Automatically triggered tool execution in chat response');
  assert(chatRes2.toolExecution.tool === 'check_attendance_eligibility', 'Correct tool check_attendance_eligibility executed');

  console.log('\n========================================');
  console.log(`Results: ${passed} Passed, ${failed} Failed`);
  console.log('========================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
