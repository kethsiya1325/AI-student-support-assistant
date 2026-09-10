/**
 * AI Student Support Assistant - Frontend Controller
 */

// Application State
let currentSessionId = 'session-' + Math.random().toString(36).substring(2, 9);
let activeProfile = null;
let allProfiles = [];
let allDocuments = [];

// Sample Prompt Starter Chips by Category
const PROMPTS_BY_CATEGORY = {
  reg: [
    "What is the minimum attendance required to appear for semester exams?",
    "Can attendance shortage be condoned? What are the rules and fees?",
    "What happens if attendance is less than 65% in a subject?",
    "Explain the 10-point grading system and pass mark requirements",
    "What is the criteria for First Class with Distinction and Honors degree?",
    "How can I apply for revaluation and photocopy of my answer sheet?"
  ],
  syl: [
    "What is the syllabus and textbook for CS204 Operating Systems?",
    "What are the topics covered in Unit 3 of CS204?",
    "What courses do I have this semester in my department?",
    "What is the syllabus for CS201 Data Structures and Algorithms?",
    "Tell me about EC201 Digital Signal Processing course credits and units"
  ],
  tools: [
    "I attended 32 out of 45 classes in Operating Systems, am I eligible?",
    "Calculate my GPA: OS grade A+ (4 credits), DBMS grade O (4 credits), Algorithms grade A (4 credits)",
    "I have 38 out of 50 classes attended. How many classes can I safely miss?",
    "When is the next semester examination and last working day?",
    "Who is the professor and what are the office hours for Operating Systems?"
  ],
  notices: [
    "What is the deadline to pay the semester examination fees?",
    "When will the Even Semester 2026 theory exams be conducted?",
    "Are there any hackathons or student competitions announced?",
    "What are the internship submission guidelines for 6th semester students?"
  ],
  faqs: [
    "What are the hostel curfew timings and outing rules?",
    "How can I apply for a mess rebate if I go on leave?",
    "What is the library book borrowing limit and overdue fine?",
    "How do I connect to campus Wi-Fi network 'Campus-Student-5G'?",
    "How can I get a Bonafide certificate for an education loan or passport?",
    "What are the minimum eligibility criteria for campus placement drives?"
  ]
};

// DOM Elements
const messagesContainer = document.getElementById('messagesContainer');
const chatForm = document.getElementById('chatForm');
const userInput = document.getElementById('userInput');
const sendBtn = document.getElementById('sendBtn');
const modelIndicator = document.getElementById('modelIndicator');

// Profile DOM
const pillName = document.getElementById('pillName');
const pillDetails = document.getElementById('pillDetails');
const userAvatar = document.getElementById('userAvatar');
const sideName = document.getElementById('sideName');
const sideRoll = document.getElementById('sideRoll');
const sideDept = document.getElementById('sideDept');
const sideSem = document.getElementById('sideSem');
const sideCgpa = document.getElementById('sideCgpa');
const sideRes = document.getElementById('sideRes');

// Modals
const profileModal = document.getElementById('profileModal');
const docsModal = document.getElementById('docsModal');
const settingsModal = document.getElementById('settingsModal');
const citationPopover = document.getElementById('citationPopover');

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  loadProfile();
  loadNotices();
  loadSettings();
  renderChips('reg');
  setupEventListeners();
});

function setupEventListeners() {
  // Chat form submit
  chatForm.addEventListener('submit', (e) => {
    e.preventDefault();
    handleUserSubmit();
  });

  // Textarea auto-height & enter key
  userInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleUserSubmit();
    }
  });

  userInput.addEventListener('input', () => {
    userInput.style.height = 'auto';
    userInput.style.height = Math.min(userInput.scrollHeight, 120) + 'px';
  });

  // Profile Pill & Switch button
  document.getElementById('profilePill').addEventListener('click', openProfileModal);
  document.getElementById('switchProfileBtn').addEventListener('click', openProfileModal);

  // Nav Buttons
  document.getElementById('openDocsBtn').addEventListener('click', openDocsModal);
  document.getElementById('openSettingsBtn').addEventListener('click', openSettingsModal);
  document.getElementById('clearChatBtn').addEventListener('click', handleClearChat);

  // Category Tabs for chips
  document.querySelectorAll('.cat-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.cat-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      renderChips(tab.dataset.cat);
    });
  });

  // Docs Filter
  document.getElementById('docsSearchInput').addEventListener('input', filterDocs);
  document.getElementById('docsCategorySelect').addEventListener('change', filterDocs);

  // Settings Save
  document.getElementById('saveSettingsBtn').addEventListener('click', handleSaveSettings);
}

/**
 * Load Active Profile
 */
async function loadProfile() {
  try {
    const res = await fetch('/api/profile');
    const data = await res.json();
    activeProfile = data.activeProfile;
    allProfiles = data.allProfiles || [];
    renderActiveProfile();
  } catch (err) {
    console.error('Failed to load profile:', err);
  }
}

function renderActiveProfile() {
  if (!activeProfile) return;
  const initials = activeProfile.name.split(' ').map(n => n[0]).join('').slice(0, 2);
  userAvatar.textContent = initials;
  pillName.textContent = activeProfile.name;
  pillDetails.textContent = `${activeProfile.departmentCode} • Sem ${activeProfile.semester} • ${activeProfile.rollNumber}`;

  sideName.textContent = activeProfile.name;
  sideRoll.textContent = activeProfile.rollNumber;
  sideDept.textContent = activeProfile.department;
  sideSem.textContent = `Semester ${activeProfile.semester}`;
  sideCgpa.textContent = `CGPA ${activeProfile.currentCgpa} (${activeProfile.creditsEarned} Cr)`;
  sideRes.textContent = activeProfile.residence;
}

/**
 * Load Active Notices
 */
async function loadNotices() {
  try {
    const res = await fetch('/api/notices');
    const data = await res.json();
    const ticker = document.getElementById('noticesTicker');
    if (data.notices && data.notices.length > 0) {
      ticker.innerHTML = data.notices.slice(0, 3).map(n => `
        <div class="notice-item-mini" onclick="sendPrompt('Tell me more about notice: ${n.title}')" style="cursor: pointer;" title="${n.summary}">
          <span class="${n.urgency === 'Urgent' ? 'tag-urgent' : 'tag-high'}">${n.urgency.toUpperCase()}</span>
          <p>${n.title}</p>
        </div>
      `).join('');
    }
  } catch (err) {
    console.error('Failed to load notices:', err);
  }
}

/**
 * Load Settings
 */
async function loadSettings() {
  try {
    const res = await fetch('/api/settings');
    const data = await res.json();
    if (data.hasApiKey) {
      modelIndicator.textContent = `Engine: ${data.activeModel}`;
      modelIndicator.style.background = 'rgba(16, 185, 129, 0.2)';
      modelIndicator.style.color = '#34d399';
    } else {
      modelIndicator.textContent = 'Engine: Local Semantic Agent';
    }
  } catch (err) {
    console.error('Failed to load settings:', err);
  }
}

/**
 * Render Prompt Chips
 */
function renderChips(catKey) {
  const container = document.getElementById('chipsContainer');
  const prompts = PROMPTS_BY_CATEGORY[catKey] || [];
  container.innerHTML = prompts.map(p => `
    <button class="chip-btn" onclick="sendPrompt('${p.replace(/'/g, "\\'")}')">${p}</button>
  `).join('');
}

/**
 * Quick send prompt
 */
window.sendPrompt = function(text) {
  userInput.value = text;
  handleUserSubmit();
};

/**
 * Handle message submission
 */
async function handleUserSubmit() {
  const message = userInput.value.trim();
  if (!message) return;

  // Add User Message
  appendUserMessage(message);
  userInput.value = '';
  userInput.style.height = 'auto';

  // Show Typing Indicator
  const typingElement = appendTypingIndicator();
  scrollToBottom();

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message,
        sessionId: currentSessionId,
        activeProfileId: activeProfile?.id
      })
    });

    const data = await res.json();
    typingElement.remove();

    if (data.error) {
      appendAssistantMessage(`⚠️ **Error**: ${data.error}`);
    } else {
      appendAssistantMessage(data.response, {
        toolExecution: data.toolExecution,
        citations: data.citations,
        modelUsed: data.modelUsed
      });

      if (data.modelUsed) {
        modelIndicator.textContent = `Engine: ${data.modelUsed}`;
      }
    }
  } catch (err) {
    typingElement.remove();
    appendAssistantMessage(`❌ **Network Error**: Unable to reach server (${err.message}).`);
  }

  scrollToBottom();
}

/**
 * Append User Message
 */
function appendUserMessage(text) {
  const msgDiv = document.createElement('div');
  msgDiv.className = 'message user-message';
  msgDiv.innerHTML = `
    <div class="msg-avatar">👤</div>
    <div class="msg-bubble">
      <div class="msg-header">
        <span class="msg-sender">${activeProfile?.name || 'Student'}</span>
        <span class="msg-tag">Just now</span>
      </div>
      <div class="msg-content">
        <p>${escapeHtml(text)}</p>
      </div>
    </div>
  `;
  messagesContainer.appendChild(msgDiv);
}

/**
 * Append Assistant Message with Rich Markdown & Interactive Tool Cards
 */
function appendAssistantMessage(rawMarkdown, options = {}) {
  const { toolExecution, citations, modelUsed } = options;

  const msgDiv = document.createElement('div');
  msgDiv.className = 'message assistant-message';

  let toolCardHtml = '';
  if (toolExecution && toolExecution.result && toolExecution.result.success) {
    toolCardHtml = generateToolWidgetHtml(toolExecution);
  }

  let citationsHtml = '';
  if (citations && citations.length > 0) {
    citationsHtml = `
      <div class="citations-wrapper">
        <span style="font-size: 0.72rem; color: var(--text-muted); font-weight: 600;">SOURCES:</span>
        ${citations.map((c, i) => `
          <div class="citation-chip" onclick="showCitation(${i})" data-citation-index="${i}">
            <span>📑</span>
            <span>${c.source}</span>
            <small style="opacity: 0.7; font-size: 0.65rem;">(${c.confidence}% match)</small>
          </div>
        `).join('')}
      </div>
    `;
    // Store citations on element for popover lookup
    msgDiv.dataset.citationsJson = JSON.stringify(citations);
  }

  const parsedHtml = marked.parse(rawMarkdown || '');

  msgDiv.innerHTML = `
    <div class="msg-avatar">🤖</div>
    <div class="msg-bubble">
      <div class="msg-header">
        <span class="msg-sender">AI Student Support Assistant</span>
        <span class="msg-tag">${modelUsed ? modelUsed : 'RAG + Tools'}</span>
      </div>
      ${toolCardHtml}
      <div class="msg-content">
        ${parsedHtml}
      </div>
      ${citationsHtml}
    </div>
  `;

  messagesContainer.appendChild(msgDiv);
}

/**
 * Generate Visual Tool Widget HTML
 */
function generateToolWidgetHtml(toolExecution) {
  const { tool, result } = toolExecution;

  if (tool === 'check_attendance_eligibility') {
    const p = result.percentage;
    const isSafe = p >= 75.0;
    const isWarning = p >= 65.0 && p < 75.0;
    const fillClass = isSafe ? 'safe' : isWarning ? 'warning' : 'danger';
    const statusClass = isSafe ? 'color: var(--success);' : isWarning ? 'color: var(--warning);' : 'color: var(--danger);';

    return `
      <div class="tool-result-widget">
        <div class="tool-widget-header">
          <span>📊 ATTENDANCE ELIGIBILITY HEALTH CHECK</span>
          <span style="${statusClass}">${result.percentage}%</span>
        </div>
        <div class="attendance-meter-wrap">
          <div class="meter-track">
            <div class="meter-threshold-marker" title="Mandatory 75% Threshold (Clause 6.1)"></div>
            <div class="meter-fill ${fillClass}" style="width: ${Math.min(100, Math.max(5, p))}%;"></div>
          </div>
          <div class="meter-labels">
            <span>0% (Detention zone < 65%)</span>
            <span style="color: #fff; font-weight: 700;">▲ 75% Required</span>
            <span>100%</span>
          </div>
        </div>
      </div>
    `;
  }

  if (tool === 'calculate_gpa') {
    return `
      <div class="tool-result-widget">
        <div class="tool-widget-header">
          <span>🎓 SGPA COMPUTATION TOOL</span>
          <span style="color: var(--accent-blue); font-size: 1.05rem; font-weight: 800;">${result.sgpa.toFixed(2)} / 10.00</span>
        </div>
        <p style="font-size: 0.78rem; color: var(--text-secondary); margin-bottom: 6px;">
          ${result.classification} • Total Credits: ${result.totalCreditsEarned} / ${result.totalCreditsOffered}
        </p>
      </div>
    `;
  }

  return '';
}

/**
 * Show Citation Popover
 */
window.showCitation = function(index) {
  // Find the closest message containing the dataset
  const clickedChip = document.querySelector(`[data-citation-index="${index}"]`);
  const msgDiv = clickedChip?.closest('.message');
  if (!msgDiv || !msgDiv.dataset.citationsJson) return;

  const citations = JSON.parse(msgDiv.dataset.citationsJson);
  const citation = citations[index];
  if (!citation) return;

  document.getElementById('citeSource').textContent = `${citation.source} (${citation.confidence}% match)`;
  document.getElementById('citeContent').innerHTML = `
    <div style="font-weight: 600; color: #fff; margin-bottom: 4px;">${citation.title}</div>
    <div style="font-size: 0.75rem; color: var(--accent-blue); margin-bottom: 6px;">Category: ${citation.category.toUpperCase()} | Department: ${citation.department}</div>
    <p style="line-height: 1.4; color: #cbd5e1;">${citation.preview}</p>
  `;

  citationPopover.classList.add('show');
};

window.hideCitation = function() {
  citationPopover.classList.remove('show');
};

/**
 * Typing Indicator
 */
function appendTypingIndicator() {
  const typingDiv = document.createElement('div');
  typingDiv.className = 'message assistant-message';
  typingDiv.id = 'typingIndicator';
  typingDiv.innerHTML = `
    <div class="msg-avatar">🤖</div>
    <div class="msg-bubble">
      <div class="typing-dots">
        <div class="typing-dot"></div>
        <div class="typing-dot"></div>
        <div class="typing-dot"></div>
      </div>
    </div>
  `;
  messagesContainer.appendChild(typingDiv);
  return typingDiv;
}

function scrollToBottom() {
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

/**
 * Persona Switcher Modal
 */
function openProfileModal() {
  const container = document.getElementById('personaOptionsContainer');
  container.innerHTML = allProfiles.map(p => {
    const isSelected = activeProfile && activeProfile.id === p.id;
    return `
      <div class="persona-option ${isSelected ? 'selected' : ''}" onclick="selectProfile('${p.id}')">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
          <strong style="color: #fff;">${p.name}</strong>
          <span class="code-val" style="font-size: 0.7rem;">${p.rollNumber}</span>
        </div>
        <p style="font-size: 0.78rem; color: var(--accent-blue);">${p.department} (Sem ${p.semester})</p>
        <p style="font-size: 0.75rem; color: var(--text-secondary); margin-top: 4px;">Standing: CGPA ${p.currentCgpa} • ${p.residence}</p>
      </div>
    `;
  }).join('');

  profileModal.classList.add('open');
}

window.selectProfile = async function(profileId) {
  try {
    const res = await fetch('/api/profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profileId })
    });
    const data = await res.json();
    if (data.success) {
      activeProfile = data.activeProfile;
      renderActiveProfile();
      closeModal('profileModal');
      appendAssistantMessage(`Switched active student persona to **${activeProfile.name}** (${activeProfile.departmentCode}, Semester ${activeProfile.semester}). My responses will now be personalized for you.`);
      scrollToBottom();
    }
  } catch (err) {
    console.error('Error switching profile:', err);
  }
};

/**
 * Knowledge Base Explorer Modal
 */
async function openDocsModal() {
  docsModal.classList.add('open');
  if (allDocuments.length === 0) {
    try {
      const res = await fetch('/api/docs');
      const data = await res.json();
      allDocuments = data.documents || [];
    } catch (err) {
      console.error('Failed to load docs:', err);
    }
  }
  renderDocs(allDocuments);
}

function renderDocs(docs) {
  const container = document.getElementById('docsListContainer');
  if (docs.length === 0) {
    container.innerHTML = `<p style="color: var(--text-secondary); padding: 20px; text-align: center;">No documents matched your search.</p>`;
    return;
  }
  container.innerHTML = docs.map(d => `
    <div class="doc-item" onclick="sendPrompt('Tell me more about: ${d.title.replace(/'/g, "\\'")}')" style="cursor: pointer;" title="Click to ask about this document">
      <span class="doc-badge">${d.category} • ${d.source}</span>
      <h4>${d.title}</h4>
      <p>${d.preview}</p>
    </div>
  `).join('');
}

function filterDocs() {
  const query = document.getElementById('docsSearchInput').value.toLowerCase();
  const category = document.getElementById('docsCategorySelect').value;

  const filtered = allDocuments.filter(d => {
    const matchCat = category === 'all' || d.category === category;
    const matchText = !query || 
      d.title.toLowerCase().includes(query) || 
      d.preview.toLowerCase().includes(query) ||
      d.source.toLowerCase().includes(query) ||
      d.tags.some(t => t.toLowerCase().includes(query));
    return matchCat && matchText;
  });

  renderDocs(filtered);
}

/**
 * Settings Modal
 */
function openSettingsModal() {
  settingsModal.classList.add('open');
}

async function handleSaveSettings() {
  const apiKey = document.getElementById('geminiApiKeyInput').value;
  const model = document.getElementById('geminiModelSelect').value;

  try {
    const res = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        geminiApiKey: apiKey,
        geminiModel: model
      })
    });
    const data = await res.json();
    if (data.success) {
      if (data.hasApiKey) {
        modelIndicator.textContent = `Engine: ${data.activeModel}`;
        modelIndicator.style.background = 'rgba(16, 185, 129, 0.2)';
        modelIndicator.style.color = '#34d399';
      } else {
        modelIndicator.textContent = 'Engine: Local Semantic Agent';
      }
      closeModal('settingsModal');
      alert('Settings saved successfully!');
    }
  } catch (err) {
    alert('Failed to save settings: ' + err.message);
  }
}

/**
 * Reset Chat
 */
async function handleClearChat() {
  if (confirm('Clear the current conversation memory?')) {
    await fetch('/api/session/clear', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: currentSessionId })
    });
    currentSessionId = 'session-' + Math.random().toString(36).substring(2, 9);
    messagesContainer.innerHTML = '';
    appendAssistantMessage(`Chat session memory reset. Hello **${activeProfile?.name || 'Student'}**, how can I assist you with regulations, syllabus, notices, or tools today?`);
  }
}

window.closeModal = function(modalId) {
  document.getElementById(modalId).classList.remove('open');
};

function escapeHtml(string) {
  return String(string).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
