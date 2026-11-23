// Builds a single-column, ATS-safe .docx: no tables, columns, icons or images.
import {
  AlignmentType, BorderStyle, Document, ExternalHyperlink, LevelFormat, Packer, Paragraph, TabStopType, TextRun,
} from 'docx';

const FONT = 'Calibri';
const ACCENT = '1F3864';
const PAGE_W = 11906; // A4
const MARGIN = 1000;

const run = (text, o = {}) => new TextRun({ text, font: FONT, ...o });
const link = (text, url) => new ExternalHyperlink({ link: url, children: [new TextRun({ text, style: 'Hyperlink', font: FONT })] });
const join = (nodes, sep) => nodes.flatMap((n, i) => (i ? [run(sep, { size: 20 }), n] : [n]));

const fmtMonth = (d) => (d ? new Date(d).toLocaleString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' }) : 'Present');

const heading = (t) =>
  new Paragraph({
    spacing: { before: 200, after: 80 },
    keepNext: true,
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: ACCENT, space: 1 } },
    children: [run(t, { bold: true, size: 24, color: ACCENT })],
  });
const bullet = (children) => new Paragraph({ numbering: { reference: 'b', level: 0 }, spacing: { after: 40 }, children });

function entryHeader(left, right, links = []) {
  const out = [
    new Paragraph({
      spacing: { before: 140, after: links.length ? 0 : 60 },
      keepNext: true,
      tabStops: [{ type: TabStopType.RIGHT, position: PAGE_W - 2 * MARGIN }],
      children: [run(left, { bold: true }), run(`\t${right}`, { bold: true })],
    }),
  ];
  if (links.length) {
    out.push(
      new Paragraph({
        spacing: { after: 60 },
        keepNext: true,
        children: [run('Links: ', { italics: true, size: 20 }), ...join(links.map((l) => link(l.label, l.url)), ' | ')],
      })
    );
  }
  return out;
}

// profile = the real base profile; tailored = output of tailorResume (optional)
export async function buildResumeDocx(profile, tailored) {
  const t = tailored || {};
  const bulletsFor = (exp) =>
    t.experience?.find((e) => String(e.experienceId) === String(exp._id))?.bullets ?? exp.bullets ?? [];

  const contact = [profile.location, profile.phone, profile.email].filter(Boolean).map((s) => run(s, { size: 20 }));
  const contactLinks = (profile.links || []).map((l) => link(l.label, l.url));

  const children = [
    new Paragraph({ alignment: AlignmentType.CENTER, children: [run((profile.fullName || '').toUpperCase(), { bold: true, size: 36, color: ACCENT })] }),
  ];
  const headline = t.headline || profile.headline;
  if (headline) children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 40 }, children: [run(headline, { bold: true, size: 24 })] }));
  children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 120 }, children: join([...contact, ...contactLinks], '  |  ') }));

  const summary = t.summary || profile.summary;
  if (summary) children.push(heading('PROFESSIONAL SUMMARY'), new Paragraph({ spacing: { after: 60 }, children: [run(summary)] }));

  const skills = t.skills?.length ? t.skills : profile.skills;
  if (skills?.length) {
    children.push(heading('TECHNICAL SKILLS'));
    for (const s of skills) children.push(bullet([run(`${s.category}: `, { bold: true }), run(s.items.join(', '))]));
  }

  if (profile.achievements?.length) {
    children.push(heading('KEY ACHIEVEMENTS'));
    for (const a of profile.achievements) children.push(bullet([run(a)]));
  }

  if (profile.experience?.length) {
    children.push(heading('WORK EXPERIENCE'));
    const sorted = [...profile.experience].sort((a, b) => new Date(b.startDate) - new Date(a.startDate));
    for (const e of sorted) {
      children.push(...entryHeader(`${e.title} | ${e.company}`, `${fmtMonth(e.startDate)} – ${fmtMonth(e.endDate)}`, e.links || []));
      for (const b of bulletsFor(e)) children.push(bullet([run(b)]));
    }
  }

  if (profile.projects?.length) {
    children.push(heading('PROJECTS'));
    for (const p of profile.projects) {
      children.push(...entryHeader(p.name, (p.techStack || []).join(', '), p.links || []));
      if (p.description) children.push(new Paragraph({ spacing: { after: 40 }, children: [run(p.description)] }));
      for (const b of p.bullets || []) children.push(bullet([run(b)]));
    }
  }

  if (profile.education?.length) {
    children.push(heading('EDUCATION'));
    for (const ed of profile.education) {
      const years = [ed.startYear, ed.endYear].filter(Boolean).join(' – ');
      const rest = [ed.institution, years, ed.score].filter(Boolean).join(' | ');
      children.push(new Paragraph({ spacing: { after: 40 }, children: [run(ed.degree, { bold: true }), run(` | ${rest}`)] }));
    }
  }

  if (profile.languages?.length) {
    children.push(heading('LANGUAGES'), new Paragraph({ children: [run(profile.languages.join('  |  '))] }));
  }

  const doc = new Document({
    creator: profile.fullName || 'JobPilot',
    title: `${profile.fullName || ''} Resume`.trim(),
    styles: { default: { document: { run: { font: FONT, size: 21 } } } },
    numbering: {
      config: [{
        reference: 'b',
        levels: [{ level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 360, hanging: 240 } } } }],
      }],
    },
    sections: [{ properties: { page: { size: { width: PAGE_W, height: 16838 }, margin: { top: 850, bottom: 850, left: MARGIN, right: MARGIN } } }, children }],
  });
  return Packer.toBuffer(doc);
}
