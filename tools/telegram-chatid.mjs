// 텔레그램 chat_id 확인 도구
// 봇에게 아무 메시지나 한 번 보낸 뒤 실행하세요.
//   node tools/telegram-chatid.mjs
const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) { console.error('TELEGRAM_BOT_TOKEN 환경변수를 먼저 설정하세요.'); process.exit(1); }

const res = await fetch(`https://api.telegram.org/bot${token}/getUpdates`);
const json = await res.json();
if (!json.ok) { console.error('조회 실패:', json); process.exit(1); }
if (json.result.length === 0) {
  console.log('수신된 메시지가 없습니다. 텔레그램에서 봇에게 아무 메시지나 보낸 뒤 다시 실행하세요.');
  process.exit(0);
}
const seen = new Map();
for (const u of json.result) {
  const chat = u.message?.chat ?? u.channel_post?.chat;
  if (chat) seen.set(chat.id, `${chat.type} / ${chat.title ?? chat.username ?? chat.first_name ?? ''}`);
}
console.log('발견된 chat_id:');
for (const [id, desc] of seen) console.log(`  ${id}   (${desc})`);
