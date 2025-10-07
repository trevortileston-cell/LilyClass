const STORAGE_KEY = 'ndaReviewProfile';
const SIGNATURE_STORAGE_KEY = 'ndaReviewSignature';
const INITIALS_STORAGE_KEY = 'ndaReviewInitials';

const profileStatusEl = document.getElementById('profileStatus');
const profileForm = document.getElementById('profileForm');
const profileFields = {
  name: document.getElementById('profileName'),
  title: document.getElementById('profileTitle'),
  company: document.getElementById('profileCompany'),
  email: document.getElementById('profileEmail'),
  phone: document.getElementById('profilePhone'),
  notes: document.getElementById('profileNotes'),
  initials: document.getElementById('profileInitials')
};
const saveProfileBtn = document.getElementById('saveProfile');
const clearProfileBtn = document.getElementById('clearProfile');
const signaturePad = document.getElementById('signaturePad');
const signatureUpload = document.getElementById('signatureUpload');
const clearSignatureBtn = document.getElementById('clearSignature');
const documentLinksInput = document.getElementById('documentLinks');
const documentFilesInput = document.getElementById('documentFiles');
const reviewBtn = document.getElementById('reviewDocuments');
const reviewStatus = document.getElementById('reviewStatus');
const resultsContainer = document.getElementById('resultsContainer');
const nextSteps = document.getElementById('nextSteps');
const rerunReviewBtn = document.getElementById('rerunReview');
const proceedBtn = document.getElementById('proceedToPacket');
const packetSection = document.getElementById('packetSection');
const packetDocumentList = document.getElementById('packetDocumentList');
const downloadPacketBtn = document.getElementById('downloadPacket');
const closingDateInput = document.getElementById('closingDate');
const signingLocationInput = document.getElementById('signingLocation');
const yearEl = document.getElementById('year');

const ISSUE_PATTERNS = [
  { pattern: /non[-\s]?compete/i, message: 'Non-compete obligations detected; confirm duration and enforceability in target jurisdictions.' },
  { pattern: /non[-\s]?solicit/i, message: 'Non-solicitation clause present; review scope across employees, customers, and partners.' },
  { pattern: /indemnif(y|ication)/i, message: 'Indemnification obligations identified; verify liability caps and carve-outs.' },
  { pattern: /hold harmless/i, message: 'Hold harmless language included; confirm mutuality and limitations.' },
  { pattern: /(exclusive (?:dealings|license|right))/i, message: 'Exclusive rights referenced; evaluate whether exclusivity aligns with acquisition goals.' },
  { pattern: /perpetual/i, message: 'Perpetual term language spotted; ensure termination and sunset provisions are acceptable.' },
  { pattern: /(limit(?:ed)? liability|liability (?:is )?limited)/i, message: 'Limitation of liability language; confirm caps and excluded damages.' },
  { pattern: /(governing law|jurisdiction)/i, message: 'Governing law / jurisdiction clause present; verify venue preference.' },
  { pattern: /arbitration/i, message: 'Arbitration requirement detected; review forum, rules, and relief carve-outs.' },
  { pattern: /injunctive relief/i, message: 'Injunctive relief rights highlighted; ensure compliance with potential restrictions.' },
  { pattern: /(assignment|may not assign)/i, message: 'Assignment restrictions noted; verify transferability post-closing.' }
];

const SUMMARY_BULLET_KEYWORDS = [
  { pattern: /(recipient|buyer)/i, label: 'Buyer obligations highlighted' },
  { pattern: /(seller|discloser)/i, label: 'Seller/discloser responsibilities mentioned' },
  { pattern: /confidential/i, label: 'Confidentiality terms emphasized' },
  { pattern: /term|duration/i, label: 'Term or duration clause present' },
  { pattern: /return.*information|destroy.*information/i, label: 'Return or destruction of materials required' }
];

const { jsPDF } = window.jspdf || {};
const signatureContext = signaturePad.getContext('2d');
signatureContext.lineJoin = 'round';
signatureContext.lineCap = 'round';
signatureContext.lineWidth = 2.4;
let drawing = false;
let currentSignatureDataUrl = null;
let blankSignatureDataUrl = null;
let reviewedDocuments = [];

if (window.pdfjsLib) {
  window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.10.111/pdf.worker.min.js';
}

document.addEventListener('DOMContentLoaded', () => {
  hydrateYear();
  initializeSignaturePad();
  loadProfileFromStorage();
});

saveProfileBtn.addEventListener('click', (event) => {
  event.preventDefault();
  handleProfileSave();
});

clearProfileBtn.addEventListener('click', (event) => {
  event.preventDefault();
  handleProfileClear();
});

clearSignatureBtn.addEventListener('click', () => {
  clearSignature();
  currentSignatureDataUrl = null;
});

signatureUpload.addEventListener('change', async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  const imageData = await readFileAsDataUrl(file);
  await renderSignature(imageData);
  currentSignatureDataUrl = signaturePad.toDataURL('image/png');
});

reviewBtn.addEventListener('click', async () => {
  await handleDocumentReview();
});

if (rerunReviewBtn) {
  rerunReviewBtn.addEventListener('click', () => {
    resultsContainer.innerHTML = '';
    nextSteps.hidden = true;
    packetSection.hidden = true;
    reviewedDocuments = [];
    reviewStatus.textContent = '';
  });
}

if (proceedBtn) {
  proceedBtn.addEventListener('click', () => {
    if (!ensureProfileReady()) {
      return;
    }
    populatePacketSummary();
    packetSection.hidden = false;
    packetSection.scrollIntoView({ behavior: 'smooth' });
  });
}

downloadPacketBtn.addEventListener('click', () => {
  if (!ensureProfileReady()) {
    return;
  }
  if (!reviewedDocuments.length) {
    alert('Review at least one document before generating the packet.');
    return;
  }
  if (!jsPDF) {
    alert('Unable to load PDF generator. Please refresh and try again.');
    return;
  }
  generatePacket();
});

function hydrateYear() {
  if (yearEl) {
    yearEl.textContent = new Date().getFullYear();
  }
}

function initializeSignaturePad() {
  signatureContext.fillStyle = '#ffffff';
  signatureContext.fillRect(0, 0, signaturePad.width, signaturePad.height);
  blankSignatureDataUrl = signaturePad.toDataURL('image/png');

  const getPoint = (event) => {
    const rect = signaturePad.getBoundingClientRect();
    const pressure = event.pressure === 0 ? 1 : event.pressure;
    signatureContext.lineWidth = 2 + pressure;
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top
    };
  };

  signaturePad.addEventListener('pointerdown', (event) => {
    drawing = true;
    const point = getPoint(event);
    signatureContext.beginPath();
    signatureContext.moveTo(point.x, point.y);
  });

  signaturePad.addEventListener('pointermove', (event) => {
    if (!drawing) return;
    event.preventDefault();
    const point = getPoint(event);
    signatureContext.lineTo(point.x, point.y);
    signatureContext.stroke();
  });

  ['pointerup', 'pointerleave', 'pointercancel'].forEach((type) => {
    signaturePad.addEventListener(type, () => {
      if (drawing) {
        drawing = false;
        signatureContext.closePath();
        currentSignatureDataUrl = signaturePad.toDataURL('image/png');
      }
    });
  });
}

function clearSignature() {
  signatureContext.clearRect(0, 0, signaturePad.width, signaturePad.height);
  signatureContext.fillStyle = '#ffffff';
  signatureContext.fillRect(0, 0, signaturePad.width, signaturePad.height);
}

async function renderSignature(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      clearSignature();
      const canvasRatio = signaturePad.width / signaturePad.height;
      const imageRatio = image.width / image.height;
      let drawWidth = signaturePad.width;
      let drawHeight = signaturePad.height;

      if (imageRatio > canvasRatio) {
        drawHeight = drawWidth / imageRatio;
      } else {
        drawWidth = drawHeight * imageRatio;
      }

      const offsetX = (signaturePad.width - drawWidth) / 2;
      const offsetY = (signaturePad.height - drawHeight) / 2;
      signatureContext.drawImage(image, offsetX, offsetY, drawWidth, drawHeight);
      resolve();
    };
    image.onerror = reject;
    image.src = dataUrl;
  });
}

function loadProfileFromStorage() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      updateProfileStatus('Profile not saved', false);
      return;
    }
    const profile = JSON.parse(stored);
    profileFields.name.value = profile.name ?? '';
    profileFields.title.value = profile.title ?? '';
    profileFields.company.value = profile.company ?? '';
    profileFields.email.value = profile.email ?? '';
    profileFields.phone.value = profile.phone ?? '';
    profileFields.notes.value = profile.notes ?? '';
    profileFields.initials.value = profile.initials ?? '';

    const storedSignature = localStorage.getItem(SIGNATURE_STORAGE_KEY);
    if (storedSignature) {
      renderSignature(storedSignature).then(() => {
        currentSignatureDataUrl = storedSignature;
      }).catch(() => {
        clearSignature();
      });
    }
    updateProfileStatus('Profile ready', true);
  } catch (error) {
    console.error('Unable to load profile', error);
    updateProfileStatus('Profile not saved', false);
  }
}

function handleProfileSave() {
  const formData = new FormData(profileForm);
  const name = formData.get('name').toString().trim();
  if (!name) {
    updateProfileStatus('Name is required to save the profile', false, true);
    profileFields.name.focus();
    return;
  }
  const profile = {
    name,
    title: formData.get('title').toString().trim(),
    company: formData.get('company').toString().trim(),
    email: formData.get('email').toString().trim(),
    phone: formData.get('phone').toString().trim(),
    notes: formData.get('notes').toString().trim(),
    initials: formData.get('initials').toString().trim()
  };

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
    const signatureData = captureSignature();
    if (signatureData) {
      localStorage.setItem(SIGNATURE_STORAGE_KEY, signatureData);
    }
    const initials = profile.initials;
    if (initials) {
      localStorage.setItem(INITIALS_STORAGE_KEY, initials);
    }
    updateProfileStatus('Profile saved and ready', true);
  } catch (error) {
    console.error('Unable to save profile', error);
    updateProfileStatus('Unable to save profile', false, true);
  }
}

function handleProfileClear() {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(SIGNATURE_STORAGE_KEY);
  localStorage.removeItem(INITIALS_STORAGE_KEY);
  profileForm.reset();
  clearSignature();
  currentSignatureDataUrl = null;
  updateProfileStatus('Profile cleared', false);
}

function captureSignature() {
  const dataUrl = signaturePad.toDataURL('image/png');
  if (dataUrl === blankSignatureDataUrl) {
    return null;
  }
  return dataUrl;
}

function ensureProfileReady() {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) {
    updateProfileStatus('Save your profile details before proceeding', false, true);
    profileForm.scrollIntoView({ behavior: 'smooth' });
    return false;
  }
  return true;
}

async function handleDocumentReview() {
  const links = documentLinksInput.value
    .split(/\n+/)
    .map((item) => item.trim())
    .filter(Boolean);
  const files = Array.from(documentFilesInput.files ?? []);

  if (!links.length && !files.length) {
    reviewStatus.textContent = 'Add at least one document link or file to review.';
    return;
  }

  resultsContainer.innerHTML = '';
  nextSteps.hidden = true;
  packetSection.hidden = true;
  reviewedDocuments = [];

  const totalItems = links.length + files.length;
  let processed = 0;
  reviewStatus.textContent = `Reviewing ${totalItems} document${totalItems > 1 ? 's' : ''}...`;

  const documents = [];

  for (const link of links) {
    processed += 1;
    reviewStatus.textContent = `Fetching document ${processed} of ${totalItems}...`;
    const doc = await processLink(link);
    documents.push(doc);
  }

  for (const file of files) {
    processed += 1;
    reviewStatus.textContent = `Processing upload ${processed} of ${totalItems}...`;
    const doc = await processFile(file);
    documents.push(doc);
  }

  reviewStatus.textContent = 'Compiling summaries and issue flags...';

  for (const doc of documents) {
    if (!doc.error && doc.text) {
      doc.analysis = analyzeDocument(doc.text);
    }
  }

  reviewedDocuments = documents.filter((doc) => !doc.error && doc.analysis);
  renderResults(documents);
  const successCount = reviewedDocuments.length;
  if (successCount) {
    nextSteps.hidden = false;
  }
  reviewStatus.textContent = `Review complete. ${successCount} document${successCount === 1 ? '' : 's'} analyzed.`;
}

function renderResults(documents) {
  resultsContainer.innerHTML = '';

  documents.forEach((doc) => {
    const card = document.createElement('article');
    card.className = 'result-card';

    const header = document.createElement('header');
    const title = document.createElement('h3');
    title.textContent = doc.name;
    header.appendChild(title);

    const badge = document.createElement('span');
    if (doc.error) {
      badge.className = 'badge issue';
      badge.textContent = 'Needs attention';
    } else if (doc.analysis?.issues?.length) {
      badge.className = 'badge issue';
      badge.textContent = `${doc.analysis.issues.length} issue${doc.analysis.issues.length > 1 ? 's' : ''} flagged`;
    } else {
      badge.className = 'badge clear';
      badge.textContent = 'No major flags';
    }
    header.appendChild(badge);
    card.appendChild(header);

    const metaList = document.createElement('ul');
    metaList.className = 'meta-list';

    if (doc.source === 'link') {
      const linkItem = document.createElement('li');
      const anchor = document.createElement('a');
      anchor.href = doc.url;
      anchor.target = '_blank';
      anchor.rel = 'noopener noreferrer';
      anchor.textContent = 'Open source link';
      linkItem.appendChild(anchor);
      metaList.appendChild(linkItem);
    }

    if (doc.analysis?.metadata?.length) {
      doc.analysis.metadata.forEach((meta) => {
        const item = document.createElement('li');
        item.textContent = meta;
        metaList.appendChild(item);
      });
    }

    if (metaList.childElementCount) {
      card.appendChild(metaList);
    }

    if (doc.error) {
      const errorText = document.createElement('p');
      errorText.className = 'summary-text';
      errorText.textContent = doc.error;
      card.appendChild(errorText);
    } else if (doc.analysis) {
      const summary = document.createElement('p');
      summary.className = 'summary-text';
      summary.textContent = doc.analysis.summary;
      card.appendChild(summary);

      if (doc.analysis.issues.length) {
        const issueList = document.createElement('ul');
        issueList.className = 'issue-list';
        doc.analysis.issues.forEach((issue) => {
          const item = document.createElement('li');
          item.textContent = issue;
          issueList.appendChild(item);
        });
        card.appendChild(issueList);
      }

      if (doc.analysis.highlights.length) {
        const highlightHeader = document.createElement('p');
        highlightHeader.className = 'summary-text';
        highlightHeader.textContent = 'Key highlights:';
        card.appendChild(highlightHeader);

        const highlightList = document.createElement('ul');
        highlightList.className = 'issue-list';
        doc.analysis.highlights.forEach((highlight) => {
          const item = document.createElement('li');
          item.textContent = highlight;
          highlightList.appendChild(item);
        });
        card.appendChild(highlightList);
      }
    }

    resultsContainer.appendChild(card);
  });
}

function analyzeDocument(text) {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  const summary = summarizeText(cleaned);
  const highlights = SUMMARY_BULLET_KEYWORDS.filter((entry) => entry.pattern.test(cleaned)).map((entry) => entry.label);

  const issues = [];
  ISSUE_PATTERNS.forEach((pattern) => {
    if (pattern.pattern.test(cleaned)) {
      issues.push(pattern.message);
    }
  });
  if (/\b(unlimited|limitless)\b liability/i.test(cleaned)) {
    issues.push('Unlimited liability language present; confirm acceptable risk.');
  }
  if (/\bperpetual\b/i.test(cleaned) && !/termination/i.test(cleaned)) {
    issues.push('Perpetual obligations without obvious termination rights; confirm exit options.');
  }
  if (/\bexclusive\b/i.test(cleaned) && !issues.find((msg) => msg.includes('Exclusive rights'))) {
    issues.push('Exclusive language present; confirm exclusivity scope.');
  }
  if (/\bassign\w*\b/i.test(cleaned) && !issues.find((msg) => msg.includes('Assignment'))) {
    issues.push('Assignment restrictions may exist; confirm transfer rights post-close.');
  }
  if (/___|\[\s*\]|\{\s*\}/.test(text)) {
    issues.push('Document contains blank fields or placeholders that require completion.');
  }

  const wordCount = cleaned ? cleaned.split(/\s+/).length : 0;
  const metadata = [`Approximate length: ${wordCount.toLocaleString()} word${wordCount === 1 ? '' : 's'}`];

  if (/effective date/i.test(cleaned)) {
    metadata.push('Effective date clause located');
  } else {
    metadata.push('Effective date language not clearly identified');
  }

  if (/return.*information|destroy.*information/i.test(cleaned)) {
    metadata.push('Data return or destruction obligations present');
  }

  if (/governing law/i.test(cleaned)) {
    const governingMatch = cleaned.match(/governing law\s*(?:of)?\s*([A-Za-z ,]+)/i);
    if (governingMatch?.[1]) {
      metadata.push(`Governing law reference: ${governingMatch[1].trim()}`);
    }
  }

  return {
    summary,
    issues: Array.from(new Set(issues)),
    metadata,
    highlights
  };
}

function summarizeText(text) {
  if (!text) {
    return 'Unable to extract text from the document.';
  }
  const sentences = text.split(/(?<=[.!?])\s+/).filter((sentence) => sentence.length > 20);
  if (!sentences.length) {
    return text.slice(0, 300) + (text.length > 300 ? '…' : '');
  }
  const selected = sentences.slice(0, 3).join(' ');
  return selected.length > 600 ? `${selected.slice(0, 600)}…` : selected;
}

async function processLink(url) {
  const name = deriveNameFromUrl(url);
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Unable to fetch document (${response.status})`);
    }
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('pdf') || url.toLowerCase().endsWith('.pdf')) {
      const arrayBuffer = await response.arrayBuffer();
      const text = await extractPdfText(arrayBuffer);
      return { name, source: 'link', url, text };
    }
    if (contentType.includes('text') || contentType.includes('json') || contentType.includes('markdown')) {
      const text = await response.text();
      return { name, source: 'link', url, text };
    }
    if (contentType.includes('rtf')) {
      const text = sanitizeRtf(await response.text());
      return { name, source: 'link', url, text };
    }
    return { name, source: 'link', url, error: 'Unsupported file type from link. Please provide PDF or text formats.' };
  } catch (error) {
    return { name, source: 'link', url, error: error.message };
  }
}

async function processFile(file) {
  const lower = file.name.toLowerCase();
  if (lower.endsWith('.doc') || lower.endsWith('.docx')) {
    return { name: file.name, source: 'upload', error: 'DOC/DOCX files are not supported. Export to PDF or text for analysis.' };
  }
  try {
    if (lower.endsWith('.pdf')) {
      const buffer = await readFileAsArrayBuffer(file);
      const text = await extractPdfText(buffer);
      return { name: file.name, source: 'upload', text };
    }
    if (lower.endsWith('.rtf')) {
      const rawText = await readFileAsText(file);
      const text = sanitizeRtf(rawText);
      return { name: file.name, source: 'upload', text };
    }
    const text = await readFileAsText(file);
    return { name: file.name, source: 'upload', text };
  } catch (error) {
    return { name: file.name, source: 'upload', error: 'Unable to read file. Please try again with a PDF or text version.' };
  }
}

function deriveNameFromUrl(url) {
  try {
    const parsed = new URL(url);
    const pathname = parsed.pathname;
    const segments = pathname.split('/').filter(Boolean);
    if (!segments.length) return url;
    return decodeURIComponent(segments[segments.length - 1]) || url;
  } catch (error) {
    return url;
  }
}

async function extractPdfText(arrayBuffer) {
  const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  let text = '';
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const pageText = content.items.map((item) => item.str).join(' ');
    text += pageText + '\n';
  }
  return text;
}

function sanitizeRtf(rtf) {
  return rtf
    .replace(/\\par[d]?/g, '\n')
    .replace(/\\'([0-9a-fA-F]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/\\[a-z]+(?:-?\d+)?\s?/g, '')
    .replace(/[{}]/g, '')
    .replace(/\s+/g, ' ');
}

function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.toString());
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

function readFileAsArrayBuffer(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.toString());
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function populatePacketSummary() {
  packetDocumentList.innerHTML = '';
  reviewedDocuments.forEach((doc) => {
    const item = document.createElement('li');
    item.textContent = `${doc.name} – ${doc.analysis.issues.length ? doc.analysis.issues.length + ' issues flagged' : 'clean review'}`;
    packetDocumentList.appendChild(item);
  });
}

function generatePacket() {
  const profile = JSON.parse(localStorage.getItem(STORAGE_KEY));
  const signatureData = localStorage.getItem(SIGNATURE_STORAGE_KEY) || captureSignature();
  const initials = localStorage.getItem(INITIALS_STORAGE_KEY) || profile?.initials || '';
  const closingDate = closingDateInput.value ? new Date(closingDateInput.value).toLocaleDateString() : 'Not specified';
  const signingLocation = signingLocationInput.value.trim() || 'Not specified';

  const pdf = new jsPDF({ unit: 'pt', format: 'letter' });
  const margin = 56;
  let cursorY = margin;

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(18);
  pdf.text('Acquisition Document Review Packet', margin, cursorY);
  cursorY += 30;

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(11);
  const preparedFor = [`Prepared for: ${profile.name}`];
  if (profile.title) preparedFor.push(profile.title);
  if (profile.company) preparedFor.push(profile.company);
  pdf.text(preparedFor.join(' • '), margin, cursorY);
  cursorY += 16;

  if (profile.email || profile.phone) {
    const contactLine = [profile.email, profile.phone].filter(Boolean).join(' • ');
    pdf.text(contactLine, margin, cursorY);
    cursorY += 16;
  }

  if (profile.notes) {
    const notesLines = pdf.splitTextToSize(`Focus notes: ${profile.notes}`, 480);
    pdf.text(notesLines, margin, cursorY);
    cursorY += notesLines.length * 14 + 4;
  }

  pdf.text(`Closing date: ${closingDate}`, margin, cursorY);
  cursorY += 16;
  pdf.text(`Signing location: ${signingLocation}`, margin, cursorY);
  cursorY += 24;

  reviewedDocuments.forEach((doc, index) => {
    if (cursorY > 700) {
      pdf.addPage();
      cursorY = margin;
    }
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(13);
    pdf.text(`${index + 1}. ${doc.name}`, margin, cursorY);
    cursorY += 18;

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(11);
    const summaryLines = pdf.splitTextToSize(`Summary: ${doc.analysis.summary}`, 480);
    pdf.text(summaryLines, margin, cursorY);
    cursorY += summaryLines.length * 14 + 6;

    if (doc.analysis.issues.length) {
      const issueHeader = 'Flagged issues:';
      pdf.text(issueHeader, margin, cursorY);
      cursorY += 14;
      doc.analysis.issues.forEach((issue) => {
        const issueLines = pdf.splitTextToSize(`• ${issue}`, 470);
        pdf.text(issueLines, margin + 10, cursorY);
        cursorY += issueLines.length * 14;
      });
    } else {
      pdf.text('• No major legal issues detected by automated review', margin + 10, cursorY);
      cursorY += 16;
    }

    if (doc.analysis.highlights.length) {
      pdf.text('Key highlights:', margin, cursorY);
      cursorY += 14;
      doc.analysis.highlights.forEach((highlight) => {
        const highlightLines = pdf.splitTextToSize(`• ${highlight}`, 470);
        pdf.text(highlightLines, margin + 10, cursorY);
        cursorY += highlightLines.length * 14;
      });
    }

    cursorY += 12;
  });

  if (cursorY > 620) {
    pdf.addPage();
    cursorY = margin;
  }

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(12);
  pdf.text('Signature & initials', margin, cursorY);
  cursorY += 24;

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(11);
  pdf.text(`Signed by: ${profile.name}`, margin, cursorY);
  cursorY += 16;

  if (signatureData && signatureData !== blankSignatureDataUrl) {
    const imageWidth = 180;
    const imageHeight = 70;
    pdf.addImage(signatureData, 'PNG', margin, cursorY, imageWidth, imageHeight);
    cursorY += imageHeight + 10;
  } else {
    pdf.text('Signature on file', margin, cursorY);
    cursorY += 16;
  }

  if (initials) {
    pdf.text(`Initials: ${initials}`, margin, cursorY);
    cursorY += 16;
  }

  pdf.text(`Date: ${new Date().toLocaleDateString()}`, margin, cursorY);

  pdf.save('Acquisition-NDA-Review-Packet.pdf');
}

function updateProfileStatus(message, success, warn = false) {
  profileStatusEl.textContent = message;
  profileStatusEl.classList.remove('success', 'warn');
  if (success) {
    profileStatusEl.classList.add('success');
  } else if (warn) {
    profileStatusEl.classList.add('warn');
  }
}
