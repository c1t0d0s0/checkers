// Japanese for Japanese-language browsers, English otherwise.

export const STRINGS = {
  en: {
    title: 'Checkers',
    pageTitle: 'Checkers — Play against the computer',
    description: 'Play American checkers (English draughts) against the computer, with three difficulty levels.',
    subtitle: 'American Checkers',
    level: 'Difficulty',
    easy: 'Easy',
    medium: 'Medium',
    hard: 'Hard',
    yourColor: 'You play',
    black: 'Black',
    white: 'White',
    blackFirst: 'Black (first)',
    whiteSecond: 'White (second)',
    newGame: 'New game',
    undo: 'Undo',
    sound: 'Sound',
    on: 'On',
    off: 'Off',
    moves: 'Moves',
    you: 'You',
    cpu: 'Computer',
    yourTurn: 'Your move',
    mustCapture: 'Your move — you must capture',
    continueJump: 'Keep jumping',
    thinking: 'Computer is thinking…',
    youWin: 'You win!',
    youLose: 'You lose',
    draw: 'Draw',
    reasonNoPieces: '{side} has no pieces left.',
    reasonNoMoves: '{side} has no legal moves.',
    reasonRepetition: 'The same position occurred three times.',
    reasonFortyMoves: '40 moves each without a capture or a man move.',
    playAgain: 'Play again',
    close: 'Close',
    confirmNew: 'Abandon the current game and start a new one?',
    rules: 'Rules',
    rulesText: 'Black moves first. Men move diagonally forward; kings move diagonally both ways. Captures are mandatory and multi-jumps must be completed. A man reaching the far row is crowned and its turn ends.',
  },
  ja: {
    title: 'チェッカー',
    pageTitle: 'チェッカー — コンピュータと対戦',
    description: '英米式チェッカー（ドラフツ）をコンピュータと対戦。初級・中級・上級の3段階。',
    subtitle: '英米式チェッカー',
    level: '強さ',
    easy: '初級',
    medium: '中級',
    hard: '上級',
    yourColor: 'あなたの駒',
    black: '黒',
    white: '白',
    blackFirst: '黒（先手）',
    whiteSecond: '白（後手）',
    newGame: '新しいゲーム',
    undo: '待った',
    sound: '効果音',
    on: 'オン',
    off: 'オフ',
    moves: '棋譜',
    you: 'あなた',
    cpu: 'コンピュータ',
    yourTurn: 'あなたの番です',
    mustCapture: 'あなたの番です — 取らなければなりません',
    continueJump: '続けて跳んでください',
    thinking: 'コンピュータが考えています…',
    youWin: 'あなたの勝ち！',
    youLose: 'あなたの負け',
    draw: '引き分け',
    reasonNoPieces: '{side}の駒がなくなりました。',
    reasonNoMoves: '{side}は動かせる駒がありません。',
    reasonRepetition: '同じ局面が3回現れました。',
    reasonFortyMoves: '取りもマンの移動もないまま双方40手が経過しました。',
    playAgain: 'もう一度',
    close: '閉じる',
    confirmNew: '現在のゲームを終了して新しいゲームを始めますか？',
    rules: 'ルール',
    rulesText: '黒が先手です。マンは斜め前に、キングは斜め前後に1マス動きます。取れる駒があれば必ず取り、連続ジャンプは最後まで続けます。相手側の端に着いたマンはキングに成り、その手番は終わります。',
  },
};

export function detectLang(nav = globalThis.navigator) {
  const list = (nav && (nav.languages && nav.languages.length ? nav.languages : [nav.language])) || [];
  const first = String(list[0] || '').toLowerCase();
  return first.startsWith('ja') ? 'ja' : 'en';
}

let lang = 'en';
export function setLang(l) { lang = STRINGS[l] ? l : 'en'; }
export function getLang() { return lang; }

export function t(key, params = {}) {
  const s = STRINGS[lang][key] ?? STRINGS.en[key] ?? key;
  return s.replace(/\{(\w+)\}/g, (_, k) => params[k] ?? '');
}

export function applyI18n(root = document) {
  document.documentElement.lang = lang;
  document.title = t('pageTitle');
  const meta = document.querySelector('meta[name="description"]');
  if (meta) meta.setAttribute('content', t('description'));
  root.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
  root.querySelectorAll('[data-i18n-aria]').forEach((el) => { el.setAttribute('aria-label', t(el.dataset.i18nAria)); });
}
