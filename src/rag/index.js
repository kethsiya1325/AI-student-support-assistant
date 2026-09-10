import { buildDocumentChunks } from './chunker.js';

const STOP_WORDS = new Set([
  'a', 'about', 'above', 'after', 'again', 'against', 'all', 'am', 'an', 'and', 'any', 'are', 'aren\'t', 'as', 'at',
  'be', 'because', 'been', 'before', 'being', 'below', 'between', 'both', 'but', 'by', 'can', 'can\'t', 'cannot',
  'could', 'couldn\'t', 'did', 'didn\'t', 'do', 'does', 'doesn\'t', 'doing', 'don\'t', 'down', 'during', 'each',
  'few', 'for', 'from', 'further', 'had', 'hadn\'t', 'has', 'hasn\'t', 'have', 'haven\'t', 'having', 'he', 'he\'d',
  'he\'ll', 'he\'s', 'her', 'here', 'here\'s', 'hers', 'herself', 'him', 'himself', 'his', 'how', 'how\'s', 'i',
  'i\'d', 'i\'ll', 'i\'m', 'i\'ve', 'if', 'in', 'into', 'is', 'isn\'t', 'it', 'it\'s', 'its', 'itself', 'let\'s',
  'me', 'more', 'most', 'mustn\'t', 'my', 'myself', 'no', 'nor', 'not', 'of', 'off', 'on', 'once', 'only', 'or',
  'other', 'ought', 'our', 'ours', 'ourselves', 'out', 'over', 'own', 'same', 'shan\'t', 'she', 'she\'d', 'she\'ll',
  'she\'s', 'should', 'shouldn\'t', 'so', 'some', 'such', 'than', 'that', 'that\'s', 'the', 'their', 'theirs',
  'them', 'themselves', 'then', 'there', 'there\'s', 'these', 'they', 'they\'d', 'they\'ll', 'they\'re', 'they\'ve',
  'this', 'those', 'through', 'to', 'too', 'under', 'until', 'up', 'very', 'was', 'wasn\'t', 'we', 'we\'d', 'we\'ll',
  'we\'re', 'we\'ve', 'were', 'weren\'t', 'what', 'what\'s', 'when', 'when\'s', 'where', 'where\'s', 'which', 'while',
  'who', 'who\'s', 'whom', 'why', 'why\'s', 'with', 'won\'t', 'would', 'wouldn\'t', 'you', 'you\'d', 'you\'ll',
  'you\'re', 'you\'ve', 'your', 'yours', 'yourself', 'yourselves', 'please', 'tell', 'college', 'give', 'want'
]);

/**
 * Tokenize and normalize text
 */
function tokenize(text) {
  if (!text) return [];
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 1 && !STOP_WORDS.has(t));
}

class RAGEngine {
  constructor() {
    this.chunks = [];
    this.invertedIndex = new Map();
    this.docLengths = new Map();
    this.avgDocLength = 0;
    this.k1 = 1.5; // BM25 term frequency saturation
    this.b = 0.75; // BM25 length normalization
    this.initialize();
  }

  initialize() {
    this.chunks = buildDocumentChunks();
    this.invertedIndex.clear();
    this.docLengths.clear();

    let totalLength = 0;
    for (const chunk of this.chunks) {
      // Include title, tags, text, source in search index
      const searchableText = `${chunk.title} ${chunk.tags.join(' ')} ${chunk.source} ${chunk.department} ${chunk.text}`;
      const tokens = tokenize(searchableText);
      this.docLengths.set(chunk.id, tokens.length);
      totalLength += tokens.length;

      // Count term frequencies within this document
      const tfMap = new Map();
      for (const token of tokens) {
        tfMap.set(token, (tfMap.get(token) || 0) + 1);
      }

      for (const [token, tf] of tfMap.entries()) {
        if (!this.invertedIndex.has(token)) {
          this.invertedIndex.set(token, []);
        }
        this.invertedIndex.get(token).push({ docId: chunk.id, tf });
      }
    }

    this.avgDocLength = this.chunks.length > 0 ? totalLength / this.chunks.length : 1;
  }

  /**
   * Search knowledge base with BM25 + exact match boosts + metadata scoping
   */
  search(query, options = {}) {
    const {
      topK = 5,
      category = null,
      department = null,
      semester = null,
      minScore = 0.1
    } = options;

    const queryTokens = tokenize(query);
    if (queryTokens.length === 0) {
      return [];
    }

    const N = this.chunks.length;
    const scores = new Map();
    const rawQueryLower = query.toLowerCase();

    // 1. BM25 calculation
    for (const token of queryTokens) {
      const postings = this.invertedIndex.get(token);
      if (!postings) continue;

      const df = postings.length;
      const idf = Math.log(1 + (N - df + 0.5) / (df + 0.5));

      for (const { docId, tf } of postings) {
        const docLength = this.docLengths.get(docId) || this.avgDocLength;
        const numerator = tf * (this.k1 + 1);
        const denominator = tf + this.k1 * (1 - this.b + this.b * (docLength / this.avgDocLength));
        const bm25 = idf * (numerator / denominator);

        scores.set(docId, (scores.get(docId) || 0) + bm25);
      }
    }

    // 2. Metadata filtering & Exact Keyword Boosts
    const chunkMap = new Map(this.chunks.map(c => [c.id, c]));
    const scoredResults = [];

    // Detect exact entities in query
    const courseCodeMatch = rawQueryLower.match(/\b([a-z]{2}\d{3})\b/i);
    const targetCourseCode = courseCodeMatch ? courseCodeMatch[1].toUpperCase() : null;

    const clauseMatch = rawQueryLower.match(/clause\s*(\d+(\.\d+)?)/i);
    const targetClause = clauseMatch ? `Clause ${clauseMatch[1]}`.toLowerCase() : null;

    const unitMatch = rawQueryLower.match(/unit\s*([1-5])/i);
    const targetUnit = unitMatch ? `unit ${unitMatch[1]}` : null;

    for (const [docId, bm25Score] of scores.entries()) {
      const chunk = chunkMap.get(docId);
      if (!chunk) continue;

      let score = bm25Score;

      // Filter by category if strictly requested
      if (category && chunk.category !== category) {
        continue;
      }

      // Exact Course Code boost (e.g. CS204, EC201, CS301)
      if (targetCourseCode) {
        if (chunk.title.toUpperCase().includes(targetCourseCode) || 
            chunk.text.toUpperCase().includes(targetCourseCode) ||
            chunk.raw?.courseCode === targetCourseCode) {
          score += 12.0; // Major boost for exact course
        }
      }

      // Exact Clause boost (e.g. Clause 6.1)
      if (targetClause && (chunk.title.toLowerCase().includes(targetClause) || chunk.source.toLowerCase().includes(targetClause))) {
        score += 10.0;
      }

      // Unit boost
      if (targetUnit && chunk.title.toLowerCase().includes(targetUnit)) {
        score += 8.0;
      }

      // Department alignment boost
      if (department && chunk.department !== 'All Departments') {
        if (chunk.department.toUpperCase() === department.toUpperCase()) {
          score += 2.0;
        } else if (targetCourseCode && chunk.raw?.courseCode !== targetCourseCode) {
          // Slight penalty if looking for department-specific info from another dept
          score -= 1.0;
        }
      }

      // Semester alignment boost
      if (semester && chunk.semester !== 'All Semesters') {
        if (chunk.semester === Number(semester)) {
          score += 1.5;
        }
      }

      // Exact phrase match in text or title
      if (rawQueryLower.length > 5 && chunk.title.toLowerCase().includes(rawQueryLower)) {
        score += 4.0;
      }

      if (score >= minScore) {
        scoredResults.push({
          ...chunk,
          score: Math.round(score * 100) / 100,
          confidence: Math.min(100, Math.round((score / (score + 2)) * 100))
        });
      }
    }

    // Sort descending by relevance score
    scoredResults.sort((a, b) => b.score - a.score);

    return scoredResults.slice(0, topK);
  }

  /**
   * Format retrieved chunks into clean context text for LLM prompts with source citations
   */
  formatContextForPrompt(retrievedChunks) {
    if (!retrievedChunks || retrievedChunks.length === 0) {
      return "No directly matching documents found in the university database.";
    }

    return retrievedChunks.map((chunk, index) => {
      return `[Citation ${index + 1}: ${chunk.source}]\nTitle: ${chunk.title}\nCategory: ${chunk.category.toUpperCase()}\nDepartment: ${chunk.department} | Semester: ${chunk.semester}\nDetails:\n${chunk.text}\n`;
    }).join('\n----------------------------------------\n\n');
  }

  /**
   * Return all documents metadata for the explorer
   */
  getAllDocuments() {
    return this.chunks.map(c => ({
      id: c.id,
      docId: c.docId,
      category: c.category,
      source: c.source,
      title: c.title,
      department: c.department,
      semester: c.semester,
      tags: c.tags,
      preview: c.text.slice(0, 160) + (c.text.length > 160 ? '...' : '')
    }));
  }
}

export const ragEngine = new RAGEngine();
