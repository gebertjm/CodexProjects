import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const frontendDir = path.join(root, 'frontend');

const routeFiles = {
  '/': 'index.html',
  '/play': path.join('play', 'index.html'),
  '/privacy': path.join('privacy', 'index.html'),
  '/terms': path.join('terms', 'index.html'),
  '/sms-terms': path.join('sms-terms', 'index.html'),
};

const requiredFooterLinks = ['href="/privacy"', 'href="/terms"', 'href="/sms-terms"'];
const secretPatterns = [
  /TWILIO_AUTH_TOKEN/i,
  /AC[a-f0-9]{32}/i,
  /SK[a-zA-Z0-9_-]{20,}/,
  /firebase.*private.*key/i,
];

function normalize(text) {
  return text.replace(/\s+/g, ' ').trim();
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function readRoute(route, relativeFile) {
  const fullPath = path.join(frontendDir, relativeFile);
  assert(statSync(fullPath).isFile(), `Missing file for ${route}: ${relativeFile}`);
  return readFileSync(fullPath, 'utf8');
}

const pages = Object.fromEntries(
  Object.entries(routeFiles).map(([route, relativeFile]) => [route, readRoute(route, relativeFile)]),
);

for (const [route, html] of Object.entries(pages)) {
  const compact = normalize(html);

  assert(compact.includes('DailyTTRPG'), `${route} must include the DailyTTRPG brand`);
  if (route !== '/play') {
    for (const link of requiredFooterLinks) {
      assert(html.includes(link), `${route} must link ${link}`);
    }
  }

  assert(!/<\s*(form|input|textarea|select)\b/i.test(html), `${route} must not include a fake signup or SMS opt-in form`);

  for (const pattern of secretPatterns) {
    assert(!pattern.test(html), `${route} appears to contain a secret-like value`);
  }
}

const home = normalize(pages['/']);
const homeRaw = pages['/'];
assert(home.includes('Async-first living campaigns.'), 'Landing page async-first hero copy is missing');
assert(
  home.includes('DailyTTRPG is a web-first platform for persistent tabletop-style adventures you can play at your own pace.'),
  'Landing page web-first platform summary is missing',
);
assert(
  /<a\s+class="button-link primary"\s+href="\/play">Start Playing<\/a>/.test(homeRaw),
  'Start Playing CTA must point to /play',
);
assert(
  /<a\s+class="button-link secondary"\s+href="\/play">Log In<\/a>/.test(homeRaw),
  'Log In CTA must point to /play',
);
assert(home.includes('Optional notifications may help players know when a new beat is ready.'), 'Landing page must deemphasize SMS as optional notifications');

const requiredLandingSections = [
  'Built for busy schedules.',
  'Authored stories, not disposable AI improv.',
  'The world remembers.',
  'Human GMs can shape the world.',
  'Write naturally. Resolve structurally.',
  'Characters that persist.',
  'See only what your character knows.',
  'Easy to enter. Deep if you want it.',
];
for (const requiredText of requiredLandingSections) {
  assert(home.includes(requiredText), `Landing page missing product pillar: ${requiredText}`);
}

const forbiddenLandingPatterns = [
  /SMS-first/i,
  /SMS adventure app/i,
  /text-message gameplay/i,
  /play entirely by SMS/i,
  /AI GM/i,
  /AI Dungeon Master/i,
  /infinite AI/i,
  /AI-generated campaigns/i,
  /AI writes your campaign/i,
  /AI replaces the GM/i,
  /fully autonomous AI/i,
  /veterals/i,
];
for (const pattern of forbiddenLandingPatterns) {
  assert(!pattern.test(homeRaw), `Landing page contains forbidden positioning: ${pattern}`);
}

assert(
  home.includes('outcomes come from authored content, rules, and structured world state'),
  'Landing page must explain AI as assistance, not the campaign source',
);
assert(
  home.includes('Content and world state are source of truth'),
  'Landing page must emphasize validated outcomes and world state',
);

const play = normalize(pages['/play']);
assert(
  play.includes('flutter_bootstrap.js') || play.includes('main.dart.js'),
  '/play must contain compiled Flutter web app bootstrapping',
);
assert(!play.includes('apps/player_app'), '/play must not be the temporary Flutter placeholder page');

const privacy = normalize(pages['/privacy']);
const privacyLower = privacy.toLowerCase();
assert(privacyLower.includes('phone number'), 'Privacy Policy must mention phone number collection');
assert(privacyLower.includes('sms message content'), 'Privacy Policy must mention SMS message content');
assert(privacyLower.includes('gameplay actions'), 'Privacy Policy must mention gameplay actions');
assert(privacyLower.includes('account information'), 'Privacy Policy must mention account data');
assert(privacyLower.includes('character data'), 'Privacy Policy must mention character data');
assert(privacyLower.includes('campaign data'), 'Privacy Policy must mention campaign data');
assert(privacyLower.includes('technical logs'), 'Privacy Policy must mention technical logs');
assert(
  privacy.includes('SMS opt-in data and consent will not be sold or shared with third parties for their marketing purposes. SMS-related data may be shared with service providers and telecommunications carriers as necessary to deliver messages.'),
  'Privacy Policy SMS privacy language is missing',
);
assert(privacy.includes('reply STOP'), 'Privacy Policy must mention STOP opt-out');
assert(privacy.includes('reply HELP'), 'Privacy Policy must mention HELP support');
assert(privacy.includes('not intended for children under 13'), 'Privacy Policy must mention children under 13');

const terms = normalize(pages['/terms']);
const termsLower = terms.toLowerCase();
for (const requiredText of [
  'by using dailyttrpg, you agree to these terms.',
  'currently in development and early testing',
  'you may not use dailyttrpg to:',
  'harass',
  'provided &ldquo;as is&rdquo; and &ldquo;as available&rdquo;',
  'will not be liable',
  'suspend or terminate access',
]) {
  assert(termsLower.includes(requiredText), `Terms page missing expected text: ${requiredText}`);
}

const smsTerms = normalize(pages['/sms-terms']);
for (const requiredText of [
  'DailyTTRPG sends gameplay-related SMS messages, including adventure prompts, player action confirmations, reminders, account/gameplay updates, and catch-up summaries.',
  'Message frequency may vary. During active play, users may receive several messages per day depending on gameplay activity and settings.',
  'Message and data rates may apply.',
  'Reply STOP to cancel.',
  'Reply HELP for help',
  'Carriers are not liable for delayed or undelivered messages.',
]) {
  assert(smsTerms.includes(requiredText), `SMS Terms page missing expected text: ${requiredText}`);
}

const styles = readFileSync(path.join(frontendDir, 'styles.css'), 'utf8');
assert(styles.includes('@media'), 'Responsive CSS media query is missing');

const config = readFileSync(path.join(frontendDir, 'site-config.js'), 'utf8');
assert(config.includes("brandName: 'DailyTTRPG'"), 'site-config.js must define DailyTTRPG brandName');
assert(config.includes("supportEmail: 'dailyttrpg@gmail.com'"), 'site-config.js must define support email');
assert(config.includes("domain: 'https://dailyttrpg.com'"), 'site-config.js must define public domain');

for (const [route, file] of Object.entries(routeFiles)) {
  console.log(`OK ${route} -> frontend/${file.replaceAll(path.sep, '/')}`);
}
console.log('OK static DailyTTRPG hosting pages passed compliance checks.');
