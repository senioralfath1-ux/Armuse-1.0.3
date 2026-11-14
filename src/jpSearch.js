'use strict';
/**
 * jpSearch.js — Mesin pencari cerdas bergaya Google untuk Armuse.
 * Mendukung pencocokan multi-token, transliterasi dua arah (Romaji <-> Hiragana <-> Katakana <-> Kanji),
 * toleransi simbol/tanda baca, normalisasi vokal panjang Jepang (Hepburn/Kunrei), serta ekspansi alias
 * unit, karakter, dan judul lagu Project SEKAI / Vocaloid / J-Pop / Anime.
 */
(function (global) {
  // Peta Hiragana & Katakana ke Romaji
  const KANA_TO_ROMAJI = {
    'あ': 'a', 'い': 'i', 'う': 'u', 'え': 'e', 'お': 'o',
    'か': 'ka', 'き': 'ki', 'く': 'ku', 'け': 'ke', 'こ': 'ko',
    'さ': 'sa', 'し': 'shi', 'す': 'su', 'せ': 'se', 'そ': 'so',
    'た': 'ta', 'ち': 'chi', 'つ': 'tsu', 'て': 'te', 'と': 'to',
    'な': 'na', 'に': 'ni', 'ぬ': 'nu', 'ね': 'ne', 'の': 'no',
    'は': 'ha', 'ひ': 'hi', 'ふ': 'fu', 'へ': 'he', 'ほ': 'ho',
    'ま': 'ma', 'み': 'mi', 'む': 'mu', 'め': 'me', 'も': 'mo',
    'や': 'ya', 'ゆ': 'yu', 'よ': 'yo',
    'ら': 'ra', 'り': 'ri', 'る': 'ru', 'れ': 're', 'ろ': 'ro',
    'わ': 'wa', 'を': 'wo', 'ん': 'n',
    'が': 'ga', 'ぎ': 'gi', 'ぐ': 'gu', 'げ': 'ge', 'ご': 'go',
    'ざ': 'za', 'じ': 'ji', 'ず': 'zu', 'ぜ': 'ze', 'ぞ': 'zo',
    'だ': 'da', 'ぢ': 'ji', 'づ': 'zu', 'で': 'de', 'ど': 'do',
    'ば': 'ba', 'び': 'bi', 'ぶ': 'bu', 'べ': 'be', 'ぼ': 'bo',
    'ぱ': 'pa', 'ぴ': 'pi', 'ぷ': 'pu', 'ぺ': 'pe', 'ぽ': 'po',
    'きゃ': 'kya', 'きゅ': 'kyu', 'きょ': 'kyo',
    'しゃ': 'sha', 'しゅ': 'shu', 'しょ': 'sho',
    'ちゃ': 'cha', 'ちゅ': 'chu', 'ちょ': 'cho',
    'にゃ': 'nya', 'にゅ': 'nyu', 'にょ': 'nyo',
    'ひゃ': 'hya', 'ひゅ': 'hyu', 'ひょ': 'hyo',
    'みゃ': 'mya', 'みゅ': 'myu', 'みょ': 'myo',
    'りゃ': 'rya', 'りゅ': 'ryu', 'りょ': 'ryo',
    'ぎゃ': 'gya', 'ぎゅ': 'gyu', 'ぎょ': 'gyo',
    'じゃ': 'ja', 'じゅ': 'ju', 'じょ': 'jo',
    'びゃ': 'bya', 'びゅ': 'byu', 'びょ': 'byo',
    'ぴゃ': 'pya', 'ぴゅ': 'pyu', 'ぴょ': 'pyo',
    'ふぁ': 'fa', 'ふぃ': 'fi', 'ふぇ': 'fe', 'ふぉ': 'fo',
    'てぃ': 'ti', 'でぃ': 'di', 'うぃ': 'wi', 'うぇ': 'we', 'うぉ': 'wo'
  };

  const ROMAJI_TO_KANA = {};
  for (const [k, v] of Object.entries(KANA_TO_ROMAJI)) {
    ROMAJI_TO_KANA[v] = k;
  }
  ROMAJI_TO_KANA['si'] = 'し';
  ROMAJI_TO_KANA['ti'] = 'ち';
  ROMAJI_TO_KANA['tu'] = 'つ';
  ROMAJI_TO_KANA['hu'] = 'ふ';
  ROMAJI_TO_KANA['zi'] = 'じ';
  ROMAJI_TO_KANA['zyu'] = 'じゅ';
  ROMAJI_TO_KANA['sya'] = 'しゃ';
  ROMAJI_TO_KANA['syu'] = 'しゅ';
  ROMAJI_TO_KANA['syo'] = 'しょ';
  ROMAJI_TO_KANA['tya'] = 'ちゃ';
  ROMAJI_TO_KANA['tyu'] = 'ちゅ';
  ROMAJI_TO_KANA['tyo'] = 'ちょ';

  function katakanaToHiragana(str) {
    if (!str) return '';
    let out = '';
    for (let i = 0; i < str.length; i++) {
      const code = str.charCodeAt(i);
      if (code >= 0x30a1 && code <= 0x30f6) {
        out += String.fromCharCode(code - 0x60);
      } else {
        out += str[i];
      }
    }
    return out;
  }

  function hiraganaToKatakana(str) {
    if (!str) return '';
    let out = '';
    for (let i = 0; i < str.length; i++) {
      const code = str.charCodeAt(i);
      if (code >= 0x3041 && code <= 0x3096) {
        out += String.fromCharCode(code + 0x60);
      } else {
        out += str[i];
      }
    }
    return out;
  }

  function kanaToRomaji(str) {
    if (!str) return '';
    const hira = katakanaToHiragana(str);
    let out = '';
    let i = 0;
    while (i < hira.length) {
      if (hira[i] === 'っ') {
        const nextKana = hira.slice(i + 1, i + 3);
        const nextRo = KANA_TO_ROMAJI[nextKana] || KANA_TO_ROMAJI[hira[i + 1]] || '';
        if (nextRo) out += nextRo[0];
        i++;
        continue;
      }
      if (hira[i] === 'ー') {
        if (out.length > 0) {
          const last = out[out.length - 1];
          if (/[aeiou]/i.test(last)) out += last;
        }
        i++;
        continue;
      }
      const two = hira.slice(i, i + 2);
      if (KANA_TO_ROMAJI[two]) {
        out += KANA_TO_ROMAJI[two];
        i += 2;
        continue;
      }
      const one = hira[i];
      if (KANA_TO_ROMAJI[one]) {
        out += KANA_TO_ROMAJI[one];
      } else {
        out += one;
      }
      i++;
    }
    return out;
  }

  function romajiToKana(str) {
    if (!str) return '';
    let s = str.toLowerCase();
    let out = '';
    let i = 0;
    while (i < s.length) {
      if (i + 1 < s.length && s[i] === s[i + 1] && /[bcdfghjklmpqrstvwxyz]/.test(s[i]) && s[i] !== 'n') {
        out += 'っ';
        i++;
        continue;
      }
      if (i + 3 <= s.length && ROMAJI_TO_KANA[s.slice(i, i + 3)]) {
        out += ROMAJI_TO_KANA[s.slice(i, i + 3)];
        i += 3;
        continue;
      }
      if (i + 2 <= s.length && ROMAJI_TO_KANA[s.slice(i, i + 2)]) {
        out += ROMAJI_TO_KANA[s.slice(i, i + 2)];
        i += 2;
        continue;
      }
      if (ROMAJI_TO_KANA[s[i]]) {
        out += ROMAJI_TO_KANA[s[i]];
        i++;
        continue;
      }
      out += s[i];
      i++;
    }
    return out;
  }

  function normalize(str) {
    if (!str) return '';
    return String(str)
      .normalize('NFKC')
      .toLowerCase()
      .replace(/[\u3000\u200B-\u200D\uFEFF]/g, ' ')
      .trim();
  }

  function stripPunct(str) {
    return normalize(str).replace(/[\s\-_.,/\\:;!?'"()~*+♥★[\]{}#@&^%$`|=<>]/g, '');
  }

  // Normalisasi ejaan Romaji Jepang (Hepburn vs Kunrei, vokal panjang ou <-> o, uu <-> u)
  function unifyRomaji(str) {
    if (!str) return '';
    return str
      .toLowerCase()
      .replace(/si/g, 'shi')
      .replace(/ti/g, 'chi')
      .replace(/tu/g, 'tsu')
      .replace(/hu/g, 'fu')
      .replace(/zi/g, 'ji')
      .replace(/sya/g, 'sha')
      .replace(/syu/g, 'shu')
      .replace(/syo/g, 'sho')
      .replace(/tya/g, 'cha')
      .replace(/tyu/g, 'chu')
      .replace(/tyo/g, 'cho')
      .replace(/zya/g, 'ja')
      .replace(/zyu/g, 'ju')
      .replace(/zyo/g, 'jo')
      .replace(/ou/g, 'o')
      .replace(/uu/g, 'u')
      .replace(/oo/g, 'o')
      .replace(/aa/g, 'a')
      .replace(/ee/g, 'e')
      .replace(/ii/g, 'i');
  }

  // Master Knowledge Base: Aturan Pemicu (triggers) dan Variasi Ekspansi (expansions)
  const ENTITY_RULES = [
    // --- UNITS ---
    {
      triggers: ['25時', 'ナイトコード', 'nightcord', 'niigo', 'ニーゴ', '宵崎奏', '朝比奈まふゆ', '東雲絵名', '暁山瑞希'],
      expansions: [
        '25時、ナイトコードで。', '25時ナイトコードで', '25時', '25-ji', '25ji', '25:00',
        'nightcord at 25:00', 'nightcord at 25', 'nightcord', 'niigo', 'ニーゴ'
      ]
    },
    {
      triggers: ['leo/need', 'レオニード', 'レオニ', '星乃一歌', '天馬咲希', '望月穂波', '日野森志歩'],
      expansions: ['Leo/need', 'Leo need', 'Leoneed', 'レオニード', 'レオニ', 'leoni']
    },
    {
      triggers: ['more more jump', 'モアモアジャンプ', 'モモジャン', '花里みのり', '桐谷遥', '桃井愛莉', '日野森雫'],
      expansions: ['MORE MORE JUMP!', 'MORE MORE JUMP', 'moremorejump', 'mmj', 'モアモアジャンプ', 'モモジャン', 'momojan', 'momochan']
    },
    {
      triggers: ['ワンダーランズ', 'wonderlands', '天馬司', '鳳えむ', '草薙寧々', '神代類'],
      expansions: ['ワンダーランズ×ショウタイム', 'ワンダーランズショウタイム', 'Wonderlands x Showtime', 'Wonderlands Showtime', 'Wonderlands', 'wxs', 'ワンダショ', 'wandasho']
    },
    {
      triggers: ['vivid bad', 'ビビッドバッド', '小豆沢こはね', '白石杏', '東雲彰人', '青柳冬弥'],
      expansions: ['Vivid BAD SQUAD', 'Vivid Bad', 'vividbadsquad', 'vbs', 'ビビッドバッドスクワッド', 'ビビバス', 'bibibasu']
    },
    {
      triggers: ['プロジェクトセカイ', 'project sekai'],
      expansions: ['project sekai', 'proseka', 'prsk', 'プロセカ']
    },

    // --- CHARACTERS ---
    {
      triggers: ['宵崎奏', '宵崎 奏'],
      expansions: ['Kanade Yoisaki', 'Yoisaki Kanade', 'Kanade', 'Yoisaki', 'かなで', 'カナデ', '楠木ともり', 'Tomori Kusunoki']
    },
    {
      triggers: ['朝比奈まふゆ', '朝比奈 まふゆ'],
      expansions: ['Mafuyu Asahina', 'Asahina Mafuyu', 'Mafuyu', 'Asahina', 'まふゆ', 'マフユ', '田辺留依', 'Rui Tanabe']
    },
    {
      triggers: ['東雲絵名', '東雲 絵名'],
      expansions: ['Ena Shinonome', 'Shinonome Ena', 'Ena', 'Shinonome', 'えな', 'エナ', 'Enanan', 'えななん', '鈴木みのり', 'Minori Suzuki']
    },
    {
      triggers: ['暁山瑞希', '暁山 瑞希'],
      expansions: ['Mizuki Akiyama', 'Akiyama Mizuki', 'Mizuki', 'Akiyama', 'みずき', 'ミズキ', 'Amia', '佐藤日向', 'Hinata Sato']
    },
    {
      triggers: ['星乃一歌', '星乃 一歌'],
      expansions: ['Ichika Hoshino', 'Hoshino Ichika', 'Ichika', 'Hoshino', 'いちか', 'イチカ', '野口瑠璃子', 'Ruriko Noguchi']
    },
    {
      triggers: ['天馬咲希', '天馬 咲希'],
      expansions: ['Saki Tenma', 'Tenma Saki', 'Saki', 'Tenma', 'さき', 'サキ', '礒部花凜', 'Karin Isobe']
    },
    {
      triggers: ['望月穂波', '望月 穂波'],
      expansions: ['Honami Mochizuki', 'Mochizuki Honami', 'Honami', 'ほなみ', 'ホナミ', '上田麗奈', 'Reina Ueda']
    },
    {
      triggers: ['日野森志歩', '日野森 志歩'],
      expansions: ['Shiho Hinomori', 'Hinomori Shiho', 'Shiho', 'しほ', 'シホ', '中島由貴', 'Yuki Nakashima']
    },
    {
      triggers: ['花里みのり', '花里 みのり'],
      expansions: ['Minori Hanasato', 'Hanasato Minori', 'Minori', 'みのり', 'ミノリ', '小倉唯', 'Yui Ogura']
    },
    {
      triggers: ['桐谷遥', '桐谷 遥'],
      expansions: ['Haruka Kiritani', 'Kiritani Haruka', 'Haruka', 'はるか', 'ハルカ', '吉岡茉祐', 'Mayu Yoshioka']
    },
    {
      triggers: ['桃井愛莉', '桃井 愛莉'],
      expansions: ['Airi Momoi', 'Momoi Airi', 'Airi', 'あいり', 'アイリ', '降幡愛', 'Ai Furihata']
    },
    {
      triggers: ['日野森雫', '日野森 雫'],
      expansions: ['Shizuku Hinomori', 'Hinomori Shizuku', 'Shizuku', 'しずく', 'シズク', '本泉莉奈', 'Rina Honizumi']
    },
    {
      triggers: ['小豆沢こはね', '小豆沢 こはね'],
      expansions: ['Kohane Azusawa', 'Azusawa Kohane', 'Kohane', 'こはね', 'コハネ', '秋奈', 'Akina']
    },
    {
      triggers: ['白石杏', '白石 杏'],
      expansions: ['An Shiraishi', 'Shiraishi An', 'An', 'あん', '鷲見友美ジェナ', 'Tomomi Jiena Sumi']
    },
    {
      triggers: ['東雲彰人', '東雲 彰人'],
      expansions: ['Akito Shinonome', 'Shinonome Akito', 'Akito', 'あきと', '今井文也', 'Fumiya Imai']
    },
    {
      triggers: ['青柳冬弥', '青柳 冬弥'],
      expansions: ['Toya Aoyagi', 'Aoyagi Toya', 'Toya', 'Touya', 'とうや', '伊東健人', 'Kento Ito']
    },
    {
      triggers: ['天馬司', '天馬 司'],
      expansions: ['Tsukasa Tenma', 'Tenma Tsukasa', 'Tsukasa', 'つかさ', '廣瀬大介', 'Daisuke Hirose']
    },
    {
      triggers: ['鳳えむ', '鳳 えむ'],
      expansions: ['Emu Otori', 'Otori Emu', 'Emu', 'えむ', 'Wonderhoi', 'わんだほい', '木野日菜', 'Hina Kino']
    },
    {
      triggers: ['草薙寧々', '草薙 寧々'],
      expansions: ['Nene Kusanagi', 'Kusanagi Nene', 'Nene', 'ねね', 'Machico']
    },
    {
      triggers: ['神代類', '神代 類'],
      expansions: ['Rui Kamishiro', 'Kamishiro Rui', 'Rui', 'るい', '土岐隼一', 'Shunichi Toki']
    },

    // --- ARTISTS ---
    { triggers: ['ado', 'アド'], expansions: ['Ado', 'アド'] },
    { triggers: ['残夢'], expansions: ['zanmu', 'zan mu', 'ado zanmu'] },
    { triggers: ['ヨルシカ', 'yorushika'], expansions: ['Yorushika', 'Yorusika', 'n-buna', 'nbuna', 'ナブナ', 'suis', 'スイ'] },
    { triggers: ['egoist'], expansions: ['EGOIST', 'エゴイスト', 'chelly', 'reche'] },
    { triggers: ['高木さん', 'からかい上手の高木さん'], expansions: ['Takagi-san', 'Takagi san', 'Takagi', 'Teasing Master Takagi-san', '高橋李依', 'Rie Takahashi', 'Takahashi Rie'] },
    { triggers: ['ころね'], expansions: ['戌神ころね', 'Inugami Korone', 'Korone', 'ころね', 'ころさん', 'Hololive', 'ホロライブ'] },
    { triggers: ['おかゆ'], expansions: ['猫又おかゆ', 'Nekomata Okayu', 'Okayu', 'おかゆ', 'Hololive', 'ホロライブ'] },
    { triggers: ['姫森ルーナ'], expansions: ['Himemori Luna', 'Luna', 'ルーナ', 'Hololive', 'ホロライブ'] },
    { triggers: ['gura'], expansions: ['Gawr Gura', 'Gura', 'Hololive', 'ホロライブ'] },
    { triggers: ['アリーチェ'], expansions: ['Alice', 'Arice', '橘 杏咲', 'Azusa Tachibana'] },
    { triggers: ['かぐや', '超かぐや姫'], expansions: ['Kaguya', '超かぐや姫', 'Chou Kaguya Hime', '夏吉ゆうこ', 'Yuko Natsuyoshi'] },
    { triggers: ['月見ヤチヨ'], expansions: ['Tsukimi Yachiyo', 'Yachiyo', 'ヤチヨ', '早見沙織', 'Saori Hayami'] },
    { triggers: ['ヴィヴィ'], expansions: ['Vivy', 'Fluorite Eye', '八木海莉', 'Kairi Yagi'] },
    { triggers: ['いよわ'], expansions: ['Iyowa', '足立レイ', 'Adachi Rei'] },
    { triggers: ['みきとp'], expansions: ['MikitoP', 'Mikito P', 'Mikito'] },
    { triggers: ['deco*27', 'deco27'], expansions: ['DECO*27', 'DECO27', 'Deco 27', 'デコ*27', 'デコ27', 'デコニーナ'] },
    { triggers: ['堀江晶太', 'kemu'], expansions: ['kemu', 'Horie Shota', 'Shota Horie'] },
    { triggers: ['supercell'], expansions: ['ryo (supercell)', 'ryo', 'スーパーセル'] },
    { triggers: ['honeyworks'], expansions: ['Haniwa', 'ハニーワークス', 'ハニワ'] },
    { triggers: ['40mp'], expansions: ['40meterP'] },
    { triggers: ['『ユイカ』', 'ユイカ'], expansions: ['Yuika'] },
    { triggers: ['忘れらんねえよ'], expansions: ['Wasureranneyo'] },
    { triggers: ['mrs. green apple', 'mrs green apple'], expansions: ['MGA', 'ミセスグリーンアップル', 'ミセス'] },
    { triggers: ['東京フィルハーモニー交響楽団', '初音ミクシンフォニー'], expansions: ['Tokyo Philharmonic Orchestra', 'Tokyo Phil', 'TPO', 'Miku Symphony', '初音ミクシンフォニー'] },
    { triggers: ['ほろはに'], expansions: ['horohanigaoka', 'hololive', 'ホロライブ'] },

    // --- SONGS (KANJI & TRANSLATIONS) ---
    { triggers: ['花結び'], expansions: ['hanamusubi', 'hana musubi', 'flower knot'] },
    { triggers: ['このまんまでいこう'], expansions: ['kono manma de ikou', 'kono manmadeikou'] },
    { triggers: ['抜け空'], expansions: ['nukesora', 'nuke sora'] },
    { triggers: ['永遠のあくる日'], expansions: ['eien no akuruhi', 'eien no akuru hi', 'forever day after'] },
    { triggers: ['あなたの空が泣くのなら'], expansions: ['anata no sora ga naku no nara'] },
    { triggers: ['星の夢'], expansions: ['hoshi no yume', 'star dream'] },
    { triggers: ['スマイル*シンフォニー'], expansions: ['スマイルシンフォニー', 'smile symphony'] },
    { triggers: ['セカイ'], expansions: ['sekai'] },
    { triggers: ['熱異常'], expansions: ['netsu ijou', 'netsu ijo', 'heat abnormal'] },
    { triggers: ['熱風'], expansions: ['neppuu', 'neppu', 'hot wind'] },
    { triggers: ['春ひさぎ'], expansions: ['haru hisagi', 'thoughtcrime'] },
    { triggers: ['昼鳶'], expansions: ['hirutobi', 'hiru tobi'] },
    { triggers: ['思想犯'], expansions: ['shisouhan', 'shisohan', 'thoughtcrime'] },
    { triggers: ['強盗と花束'], expansions: ['goutou to hanataba', 'goto to hanataba', 'robber and bouquet'] },
    { triggers: ['逃亡'], expansions: ['toubou', 'tobo', 'escape'] },
    { triggers: ['レプリカント'], expansions: ['replicant'] },
    { triggers: ['花人局'], expansions: ['hanahitomodoki', 'hanahitotoki'] },
    { triggers: ['風を食む'], expansions: ['kaze wo hamu', 'eat the wind'] },
    { triggers: ['嘘月'], expansions: ['usotsuki', 'lie moon'] },
    { triggers: ['爆弾魔'], expansions: ['bakudanma', 'bomb man'] },
    { triggers: ['夜行'], expansions: ['yakou', 'yako', 'night journey'] },
    { triggers: ['盗作'], expansions: ['tousaku', 'tosaku', 'plagiarism'] },
    { triggers: ['春泥棒'], expansions: ['haru dorobou', 'haru dorobo', 'spring thief'] },
    { triggers: ['花に亡霊'], expansions: ['hana ni bourei', 'hana ni borei', 'ghost in a flower'] },
    { triggers: ['桜日和とタイムマシン'], expansions: ['sakura biyori to time machine'] },
    { triggers: ['初夏'], expansions: ['shoka', 'early summer'] },
    { triggers: ['うっせぇわ'], expansions: ['usseewa', 'ussee wa', 'shut up'] },
    { triggers: ['阿修羅ちゃん'], expansions: ['ashura-chan', 'ashura chan', 'ashurachan'] },
    { triggers: ['夜のピエロ'], expansions: ['yoru no pierrot', 'yoru no piero', 'night clown'] },
    { triggers: ['クラクラ'], expansions: ['kura kura', 'kurakura'] },
    { triggers: ['ショコラカタブラ'], expansions: ['chocolat cadabra', 'chocola cadabra'] },
    { triggers: ['ウタカタララバイ'], expansions: ['utakata lullaby'] },
    { triggers: ['私は最強'], expansions: ['watashi wa saikyou', 'watashi wa saikyo', "i'm invincible", 'invincible'] },
    { triggers: ['向日葵'], expansions: ['himawari', 'sunflower'] },
    { triggers: ['マザーランド'], expansions: ['motherland'] },
    { triggers: ['ギラギラ'], expansions: ['gira gira', 'giragira'] },
    { triggers: ['新時代'], expansions: ['shin jidai', 'shinjidai', 'new genesis'] },
    { triggers: ['ルル'], expansions: ['ruru'] },
    { triggers: ['ロックスター'], expansions: ['rockstar'] },
    { triggers: ['唱'], expansions: ['show', 'shou', 'syou'] },
    { triggers: ['いばら'], expansions: ['ibara', 'thorn'] },
    { triggers: ['心という名の不可解'], expansions: ['kokoro to iu na no fukakai'] },
    { triggers: ['リベリオン'], expansions: ['rebellion'] },
    { triggers: ['逆光'], expansions: ['gyakkou', 'gyakko', 'backlight'] },
    { triggers: ['アタシは問題作'], expansions: ['atashi wa mondaisaku', 'problem child'] },
    { triggers: ['行方知れず'], expansions: ['yukue shirezu', 'missing'] },
    { triggers: ['愛して愛して愛して'], expansions: ['aishite aishite aishite', 'love me love me love me'] },
    { triggers: ['会いたくて'], expansions: ['aitakute', 'missing you'] },
    { triggers: ['エルフ'], expansions: ['elf'] },
    { triggers: ['レディメイド'], expansions: ['readymade', 'ready made'] },
    { triggers: ['ラッキー・ブルート'], expansions: ['lucky brute'] },
    { triggers: ['過学習'], expansions: ['kagakushuu', 'kagakushu', 'overfitting'] },
    { triggers: ['原罪の灯'], expansions: ['genzai no hi', 'genzai no tomoshibi', 'light of original sin'] },
    { triggers: ['オールナイトレディオ'], expansions: ['all night radio'] },
    { triggers: ['わたしに花束'], expansions: ['watashi ni hanataba', 'bouquet for me'] },
    { triggers: ['踊'], expansions: ['odo', 'dance'] },
    { triggers: ['雨、キミを連れて'], expansions: ['ame kimi wo tsurete'] },
    { triggers: ['手遅れ'], expansions: ['teokure', 'too late'] },
    { triggers: ['想いを巡らす100の事象'], expansions: ['omoi wo megurasu 100 no jishou'] },
    { triggers: ['この世界で見つけたもの'], expansions: ['kono sekai de mitsuketa mono'] },
    { triggers: ['英雄 運命の詩'], expansions: ['eiyuu unmei no uta', 'eiyu unmei no uta', 'fate apocrypha'] },
    { triggers: ['霽れを待つ'], expansions: ['hare wo matsu', 'waiting for clear weather'] },
    { triggers: ['相生'], expansions: ['aioi'] },
    { triggers: ['フロムトーキョー'], expansions: ['from tokyo'] },
    { triggers: ['流星のパルス'], expansions: ['ryuusei no pulse', 'ryusei no pulse', 'meteor pulse'] },
    { triggers: ['インテグラル'], expansions: ['integral'] },
    { triggers: ['レグルス'], expansions: ['regulus'] },
    { triggers: ['オーダーメイド'], expansions: ['order made', 'ordermade'] },
    { triggers: ['てらてら'], expansions: ['tera tera', 'teratera'] },
    { triggers: ['テオ'], expansions: ['teo'] },
    { triggers: ['ヒバナ'], expansions: ['hibana', 'spark'] },
    { triggers: ['ドラマツルギー'], expansions: ['dramaturgy'] },
    { triggers: ['カゲロウデイズ'], expansions: ['kagerou days', 'kagerou daze', 'kagerou project'] },
    { triggers: ['夜に駆ける'], expansions: ['yoru ni kakeru', 'racing into the night', 'into the night', 'yoasobi'] },
    { triggers: ['「1」'], expansions: ['one', '1'] },
    { triggers: ['群青讃歌'], expansions: ['gunjou sanka', 'gunjo sanka', 'ultramarine hymn'] },
    { triggers: ['いかないで'], expansions: ['ikanaide', "don't go"] },
    { triggers: ['タイムマシン'], expansions: ['time machine', 'timemachine'] },
    { triggers: ['ウミユリ海底譚'], expansions: ['umiyuri kaiteitan', 'tale of deep sea lily'] },
    { triggers: ['ステラ'], expansions: ['stella'] },
    { triggers: ['天使のクローバー'], expansions: ['tenshi no clover', 'angel clover'] },
    { triggers: ['はしる! とおく! とどく!'], expansions: ['hashiru tooku todoku', 'hashiru! tooku! todoku!'] },
    { triggers: ['アンチユー'], expansions: ['anti-you', 'anti you', 'antiyou'] },
    { triggers: ['キラー'], expansions: ['killer'] },
    { triggers: ['チームメイト'], expansions: ['teammate'] },
    { triggers: ['はぐ'], expansions: ['hagu', 'hug'] },
    { triggers: ['ももいろの鍵'], expansions: ['momoiro no kagi', 'peach colored key', 'pink key'] },
    { triggers: ['私は、私達は'], expansions: ['watashi wa watashitachi wa', 'watashitachi wa', 'i am we are'] },
    { triggers: ['ツギハギスタッカート'], expansions: ['tsugihagi staccato', 'patchwork staccato'] },
    { triggers: ['ハッピーシンセサイザ'], expansions: ['happy synthesizer'] },
    { triggers: ['ニア'], expansions: ['near'] },
    { triggers: ['ビバハピ'], expansions: ['viva happy', 'vivahapi'] },
    { triggers: ['メルティランドナイトメア'], expansions: ['melty land nightmare'] },
    { triggers: ['恋愛裁判'], expansions: ['renai saiban', 'love trial'] },
    { triggers: ['ミルククラウン・オン・ソーネチカ'], expansions: ['milk crown on sonechka'] },
    { triggers: ['どりーみんチュチュ'], expansions: ['dreamin chuchu', 'dreaming chuchu'] },
    { triggers: ['ロミオとシンデレラ'], expansions: ['romeo and cinderella'] },
    { triggers: ['地球最後の告白を'], expansions: ['chikyuu saigo no kokuhaku wo', 'chikyu saigo no kokuhaku wo'] },
    { triggers: ['マシュマリー'], expansions: ['marshmary'] },
    { triggers: ['からくりピエロ'], expansions: ['karakuri pierrot', 'karakuri clown'] },
    { triggers: ['ダーリンダンス'], expansions: ['darling dance'] },
    { triggers: ['少女レイ'], expansions: ['shoujo rei', 'shojo rei', 'ghost girl'] },
    { triggers: ['心予報'], expansions: ['kokoro yohou', 'kokoro yoho', 'heart forecast'] },
    { triggers: ['ヴァンパイア'], expansions: ['vampire'] },
    { triggers: ['トリノコシティ'], expansions: ['torinoko city'] },
    { triggers: ['ロンリーユニバース'], expansions: ['lonely universe'] },
    { triggers: ['気まぐれメルシィ'], expansions: ['kimagure mercy'] },
    { triggers: ['深海少女'], expansions: ['shinkai shoujo', 'shinkai shojo', 'deep sea girl'] },
    { triggers: ['セツナトリップ'], expansions: ['setsuna trip'] },
    { triggers: ['限りなく灰色へ'], expansions: ['kagirinaku haiiro e', 'close to gray', 'infinitely gray'] },
    { triggers: ['アイディスマイル'], expansions: ['id smile', 'aidi smile'] },
    { triggers: ['演劇'], expansions: ['engeki', 'theater', 'theatre'] },
    { triggers: ['25時の情熱'], expansions: ['25-ji no jounetsu', '25ji no jonetsu', 'passion at 25:00'] },
    { triggers: ['再生'], expansions: ['saisei', 'rebirth', 'playback'] },
    { triggers: ['カナデトモスソラ'], expansions: ['kanadetomosusora', 'kanade tomosu sora'] },
    { triggers: ['君の夜をくれ'], expansions: ['kimi no yoru wo kure', 'give me your night'] },
    { triggers: ['Iなんです'], expansions: ['i nandesu', 'i nan desu', "it's i"] },
    { triggers: ['ロウワー'], expansions: ['lower'] },
    { triggers: ['トリコロージュ'], expansions: ['tricologe'] },
    { triggers: ['ノマド'], expansions: ['nomad'] },
    { triggers: ['バグ'], expansions: ['bug'] },
    { triggers: ['ザムザ'], expansions: ['samsa', 'zamuza'] },
    { triggers: ['キティ'], expansions: ['kitty'] },
    { triggers: ['心做し'], expansions: ['kokoronashi', 'heartless', 'somehow'] },
    { triggers: ['とても素敵な六月でした'], expansions: ['totemo suteki na rokugatsu deshita', 'it was a very lovely june'] },
    { triggers: ['キュートなカノジョ'], expansions: ['cute na kanojo', 'cute girlfriend'] },
    { triggers: ['スロウダウナー'], expansions: ['slow downer'] },
    { triggers: ['神っぽいな'], expansions: ['kamippoi na', 'god-ish'] },
    { triggers: ['エンヴィーベイビー'], expansions: ['envy baby'] },
    { triggers: ['ド屑'], expansions: ['dokuzu'] },
    { triggers: ['ラグトレイン'], expansions: ['lagtrain', 'lag train'] },
    { triggers: ['マインドブランド'], expansions: ['mind brand'] },
    { triggers: ['好きでいて'], expansions: ['suki de ite'] },
    { triggers: ['トワイライトライト'], expansions: ['twilight light'] },
    { triggers: ['私は雨'], expansions: ['watashi wa ame', 'i am rain'] },
    { triggers: ['出逢ってしまったから'], expansions: ['deatte shimatta kara'] },
    { triggers: ['ビバリウム'], expansions: ['vivarium'] },
    { triggers: ['かわいこちぇっく！'], expansions: ['kawaiko check'] },
    { triggers: ['綻び花よまた咲き誇れ'], expansions: ['hokorobihana yo mata sakihokore'] },
    { triggers: ['アイドル十ヶ条'], expansions: ['idol jukkajou', 'idol jukkajo'] },
    { triggers: ['青と夏'], expansions: ['ao to natsu', 'blue and summer'] },
    { triggers: ['君の知らない物語'], expansions: ['kimi no shiranai monogatari'] },
    { triggers: ['猫日'], expansions: ['nekobi', 'neko hi', 'cat day'] },
    { triggers: ['奏(かなで)'], expansions: ['kanade', 'sukimaswitch'] },
    { triggers: ['粉雪'], expansions: ['konayuki', 'powder snow'] },
    { triggers: ['キセキ'], expansions: ['kiseki', 'miracle'] },
    { triggers: ['ありがとう'], expansions: ['arigatou', 'arigato', 'thank you'] },
    { triggers: ['あなたに'], expansions: ['anata ni'] },
    { triggers: ['言わないけどね。'], expansions: ['iwanai kedo ne'] },
    { triggers: ['やさしい気持ち'], expansions: ['yasashii kimochi'] },
    { triggers: ['100万回の「I love you」'], expansions: ['hyakuman kai no i love you'] },
    { triggers: ['白い雪のプリンセスは'], expansions: ['shiroi yuki no princess wa', 'white snow princess'] },
    { triggers: ['初音ミクの消失'], expansions: ['hatsune miku no shoushitsu', 'disappearance of hatsune miku'] },
    { triggers: ['脱法ロック'], expansions: ['dappou rock', 'dappo rock', 'law evading rock'] },
    { triggers: ['星屑ユートピア'], expansions: ['hoshikuzu utopia', 'stardust utopia'] },
    { triggers: ['カンタレラ'], expansions: ['cantarella'] },
    { triggers: ['サンドリヨン'], expansions: ['cendrillon'] },
    { triggers: ['ワールドイズマイン'], expansions: ['world is mine'] },
    { triggers: ['瞬間、シンフォニー。'], expansions: ['shunkan symphony', 'moment symphony'] },
    { triggers: ['風と私の物語'], expansions: ['kaze to watashi no monogatari'] },
    { triggers: ['なんもねえ'], expansions: ['nanmo nee'] },
    { triggers: ['ロキ'], expansions: ['roki', 'roki roki'] },
    { triggers: ['アスノヨゾラ哨戒班'], expansions: ['asu no yozora shoukaihan', 'night sky patrol of tomorrow'] },
    { triggers: ['青く駆けろ!'], expansions: ['aoku kakero', 'run blue'] },
    { triggers: ['六兆年と一夜物語'], expansions: ['rokuchou nen to ichiya monogatari', 'rokucho nen to ichiya monogatari', 'six trillion years'] },
    { triggers: ['余花にみとれて'], expansions: ['yoka ni mitorete'] },
    { triggers: ['好きだから。'], expansions: ['suki dakara', 'because i love you'] },
    { triggers: ['ロストワンの号哭'], expansions: ['lost one no goukoku', "the lost one's weeping"] },
    { triggers: ['ゴーストルール'], expansions: ['ghost rule'] },
    { triggers: ['僕らまだアンダーグラウンド'], expansions: ['bokura mada underground'] },
    { triggers: ['アサガオの散る頃に'], expansions: ['asagao no chiru koro ni', 'when morning glory falls'] },
    { triggers: ['心拍数♯0822'], expansions: ['shinpaku suu 0822', 'heartbeat 0822'] },
    { triggers: ['ロストエンファウンド'], expansions: ['lost and found'] },
    { triggers: ['天ノ弱'], expansions: ['amanojaku', 'born coward'] },
    { triggers: ['夜もすがら君想ふ'], expansions: ['yomosugara kimi omou'] },
    { triggers: ['アトラクトライト'], expansions: ['attract light'] },
    { triggers: ['天樂'], expansions: ['tengaku', 'heaven music'] },
    { triggers: ['サマータイムレコード'], expansions: ['summertime record'] },
    { triggers: ['初めての恋が終わる時'], expansions: ['hajimete no koi ga owaru toki', 'when first love ends'] },
    { triggers: ['快晴'], expansions: ['kaisei', 'clear weather'] },
    { triggers: ['幾望の月'], expansions: ['kibou no tsuki', 'kibo no tsuki'] },
    { triggers: ['東京テディベア'], expansions: ['tokyo teddy bear'] },
    { triggers: ['抜錨'], expansions: ['batsubyou', 'weigh anchor'] },
    { triggers: ['ハイドアンド・シーク'], expansions: ['hide and seek'] },
    { triggers: ['林檎売りの泡沫少女'], expansions: ['ringo uri no utakata shoujo'] },
    { triggers: ['ワールド・ランプシェード'], expansions: ['world lampshade'] },
    { triggers: ['モザイクロール'], expansions: ['mosaic roll'] },
    { triggers: ['きゅうくらりん'], expansions: ['kyuukurarin', 'kyu kurarin'] },
    { triggers: ['悪役にキスシーンを'], expansions: ['akuyaku ni kiss scene wo'] },
    { triggers: ['さよならプリンセス'], expansions: ['sayonara princess'] },
    { triggers: ['くうになる'], expansions: ['kuu ni naru'] },
    { triggers: ['だめにんげんだ!'], expansions: ['dame ningen da'] },
    { triggers: ['ポッピンキャンディ☆フィーバー!'], expansions: ['poppin candy fever'] },
    { triggers: ['如月アテンション'], expansions: ['kisaragi attention'] },
    { triggers: ['キャットフード'], expansions: ['cat food'] },
    { triggers: ['自傷無色'], expansions: ['jishou mushoku', 'self inflicted colorless'] },
    { triggers: ['命に嫌われている'], expansions: ['inochi ni kirawarete iru', 'inochi ni kirawarete', 'hated by life itself'] },
    { triggers: ['シャルル'], expansions: ['charles'] },
    { triggers: ['ハロ_ハワユ'], expansions: ['hello how are you', 'hello_how_are_you'] },
    { triggers: ['乙女解剖'], expansions: ['otome kaibou', 'otome kaibo', 'maiden dissection'] },
    { triggers: ['ボッカデラベリタ'], expansions: ['bocca della verita'] },
    { triggers: ['独りんぼエンヴィー'], expansions: ['hitorinbo envy', 'hitori envy', 'solitary hide and seek envy'] },
    { triggers: ['とても痛い痛がりたい'], expansions: ['totemo itai itagaritai'] },
    { triggers: ['ビターチョコデコレーション'], expansions: ['bitter choco decoration'] },
    { triggers: ['カトラリー'], expansions: ['cutlery'] },
    { triggers: ['ヴィラン'], expansions: ['villain'] },
    { triggers: ['妄想感傷代償連盟'], expansions: ['mousou kanshou daishou renmei', 'mkdr'] },
    { triggers: ['ベノム'], expansions: ['venom'] },
    { triggers: ['メリュー'], expansions: ['mairieux', 'meryu'] },
    { triggers: ['泥中に咲く'], expansions: ['deichuu ni saku', 'blooms in the mud'] },
    { triggers: ['フォニイ'], expansions: ['phony', 'phonii'] },
    { triggers: ['ジェヘナ'], expansions: ['gehenna'] },
    { triggers: ['ノンブレス・オブリージュ'], expansions: ['non breath oblige', 'non-breath oblige'] },
    { triggers: ['アイロニ'], expansions: ['irony', 'aironi'] },
    { triggers: ['それがあなたの幸せとしても'], expansions: ['sore ga anata no shiawase to shite mo'] },
    { triggers: ['命ばっかり'], expansions: ['inochi bakkari'] },
    { triggers: ['悔やむと書いてミライ'], expansions: ['kuyamu to kaite mirai'] },
    { triggers: ['ジャックポットサッドガール'], expansions: ['jackpot sad girl'] },
    { triggers: ['携帯恋話'], expansions: ['keitai renwa', 'cellphone love story'] },
    { triggers: ['ブラックロックシューター'], expansions: ['black rock shooter'] },
    { triggers: ['ワールズエンド・ダンスホール'], expansions: ['worlds end dancehall'] },
    { triggers: ['ルカルカ★ナイトフィーバー'], expansions: ['luka luka night fever'] },
    { triggers: ['舞台'], expansions: ['butai', 'stage'] },
    { triggers: ['依存香炉'], expansions: ['izon kouro', 'izon koro'] },
    { triggers: ['星降る海'], expansions: ['hoshi furu umi'] },
    { triggers: ['私は、わたしの事が好き。', 'わたしの事が好き'], expansions: ['watashi wa watashi no koto ga suki'] },
    { triggers: ['その音が鳴るなら'], expansions: ['sono oto ga naru nara'] },
    { triggers: ['告白'], expansions: ['kokuhaku', 'confession'] },
    { triggers: ['第一章', '君を捜す空'], expansions: ['synchronicity', 'daiisshou', 'kimi wo sagasu sora'] },
    { triggers: ['第二章', '光と影の楽園'], expansions: ['synchronicity', 'dainishou', 'hikari to kage no rakuen'] },
    { triggers: ['第三章', '巡る世界のレクイエム'], expansions: ['synchronicity', 'daisanshou', 'meguru sekai no requiem'] },
    { triggers: ['番凩', '千年の独奏歌', 'ドクターファンクビート'], expansions: ['doctor funk beat', 'tsugai kogarashi', 'sennen no dokusouka'] },
    { triggers: ['あなたにおくるアイの歌', 'departures'], expansions: ['departures', 'anata ni okuru ai no uta'] }
  ];

  const COMPILED_RULES = ENTITY_RULES.map((r) => ({
    normTriggers: r.triggers.map((t) => normalize(t)),
    compactTriggers: r.triggers.map((t) => stripPunct(t)).filter((t) => t.length >= 2),
    allExpansions: r.expansions
  }));

  // Membangun indeks pencarian lengkap untuk sebuah lagu
  function buildIndex(t) {
    if (!t) return '';
    if (t._jpIndex && typeof t._jpIndex.flat === 'string') return t._jpIndex.flat;

    const parts = [
      t.title || (t.meta && t.meta.title) || (t.custom && t.custom.title) || '',
      t.artist || (t.meta && t.meta.artist) || (t.custom && t.custom.artist) || '',
      t.album || (t.meta && t.meta.album) || (t.custom && t.custom.album) || '',
      t.albumArtist || (t.meta && t.meta.albumArtist) || (t.custom && t.custom.albumArtist) || '',
      t.genre || (t.meta && t.meta.genre) || (t.custom && t.custom.genre) || '',
      Array.isArray(t.tags) ? t.tags.join(' ') : ''
    ].filter(Boolean);

    const raw = parts.join(' ');
    const norm = normalize(raw);
    const compact = stripPunct(raw);
    const hira = katakanaToHiragana(norm);
    const kata = hiraganaToKatakana(norm);
    const romaji = kanaToRomaji(norm);
    const uromaji = unifyRomaji(romaji);

    const tokenSet = new Set();
    const pushText = (s) => {
      if (!s) return;
      tokenSet.add(s);
      const words = s.split(/[\s,./\\:;!?'"()~*+[\]{}#@&^%$`|=<>]+/);
      for (const w of words) {
        if (w.length >= 2) tokenSet.add(w);
      }
    };

    pushText(norm);
    pushText(hira);
    pushText(kata);
    pushText(romaji);
    pushText(uromaji);

    for (const rule of COMPILED_RULES) {
      let triggered = false;
      for (const trig of rule.normTriggers) {
        if (norm.includes(trig) || hira.includes(trig) || kata.includes(trig)) {
          triggered = true;
          break;
        }
      }
      if (!triggered) {
        for (const ctrig of rule.compactTriggers) {
          if (compact.includes(ctrig)) {
            triggered = true;
            break;
          }
        }
      }
      if (triggered) {
        for (const exp of rule.allExpansions) {
          const en = normalize(exp);
          pushText(en);
          const eh = katakanaToHiragana(en);
          if (eh !== en) pushText(eh);
          const er = kanaToRomaji(en);
          if (er !== en) {
            pushText(er);
            pushText(unifyRomaji(er));
          }
        }
      }
    }

    const flat = Array.from(tokenSet).join(' ');
    const indexObj = {
      flat: flat,
      compact: stripPunct(flat),
      unified: unifyRomaji(flat)
    };

    if (typeof t === 'object') {
      try {
        t._jpIndex = indexObj;
      } catch (_) {}
    }

    return flat;
  }

  // Stopwords Google Search (kata sambung / partikel fleksibel)
  const STOPWORDS = new Set([
    'at', 'the', 'a', 'an', 'in', 'of', 'to', 'for', 'and', 'with',
    'feat', 'ft', 'cv', 'no', 'de', 'wa', 'ga', 'wo', 'ni', 'x', '&', 'vs'
  ]);

  // Mengurai kueri pencarian menjadi token kata bergaya Google
  function parseQuery(rawQuery) {
    const norm = normalize(rawQuery);
    if (!norm) return [];

    const rawTokens = norm.split(/\s+/).filter(Boolean);
    const tokens = [];

    for (const tok of rawTokens) {
      const clean = stripPunct(tok);
      const subTerms = new Set([tok]);
      if (clean) subTerms.add(clean);

      const hira = katakanaToHiragana(tok);
      if (hira) subTerms.add(hira);
      const kata = hiraganaToKatakana(tok);
      if (kata) subTerms.add(kata);
      const romaji = kanaToRomaji(tok);
      if (romaji) {
        subTerms.add(romaji);
        subTerms.add(unifyRomaji(romaji));
      }

      if (/^[a-z0-9'-]+$/i.test(tok)) {
        subTerms.add(unifyRomaji(tok));
        const fromRo = romajiToKana(tok);
        if (fromRo) {
          subTerms.add(fromRo);
          subTerms.add(hiraganaToKatakana(fromRo));
        }
      }

      for (const rule of COMPILED_RULES) {
        let m = false;
        for (const exp of rule.allExpansions) {
          const en = normalize(exp);
          const ec = stripPunct(exp);
          if (tok === en || clean === ec || (tok.length >= 4 && en.length >= 4 && (en.startsWith(tok) || tok.startsWith(en)))) {
            m = true;
            break;
          }
        }
        if (!m) {
          for (const trig of rule.normTriggers) {
            const tn = trig;
            const tc = stripPunct(trig);
            if (tok === tn || clean === tc || hira === tn || kata === tn) {
              m = true;
              break;
            }
          }
        }
        if (m) {
          for (const trig of rule.normTriggers) {
            subTerms.add(trig);
          }
          for (const exp of rule.allExpansions) {
            subTerms.add(normalize(exp));
          }
        }
      }

      tokens.push({
        raw: tok,
        clean: clean,
        isStopword: STOPWORDS.has(tok),
        variants: Array.from(subTerms).filter(Boolean)
      });
    }

    return tokens;
  }

  function tokenMatches(item, token) {
    for (const variant of token.variants) {
      if (variant.length <= 2) {
        const re = new RegExp('(?:^|[^a-z0-9\u3040-\u30ff\u4e00-\u9faf])' + variant.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?:$|[^a-z0-9\u3040-\u30ff\u4e00-\u9faf])', 'i');
        if (re.test(item.flat)) return true;
      } else {
        if (item.flat && item.flat.includes(variant)) return true;
        if (item.unified && item.unified.includes(variant)) return true;
        if (variant.length >= 3 && item.compact && item.compact.includes(stripPunct(variant))) return true;
      }
    }
    return false;
  }

  // Evaluator pencarian multi-token bergaya Google
  function test(target, rawQuery) {
    if (!rawQuery || !rawQuery.trim()) return true;
    if (target == null) return false;

    let indexObj = null;
    if (typeof target === 'object' && target._jpIndex) {
      indexObj = target._jpIndex;
    } else if (typeof target === 'object' && target.flat && target.compact) {
      indexObj = target;
    } else if (typeof target === 'object' && (target.title || target.meta || target.path)) {
      buildIndex(target);
      indexObj = target._jpIndex;
    } else if (typeof target === 'string') {
      const normStr = normalize(target);
      const compStr = stripPunct(target);
      const uniStr = unifyRomaji(normStr);
      let expText = normStr;
      for (const rule of COMPILED_RULES) {
        for (const trig of rule.normTriggers) {
          if (normStr.includes(trig)) {
            expText += ' ' + rule.allExpansions.map(normalize).join(' ');
            break;
          }
        }
      }
      indexObj = {
        flat: expText,
        compact: compStr,
        unified: uniStr
      };
    } else {
      indexObj = { flat: String(target).toLowerCase(), compact: stripPunct(String(target)), unified: '' };
    }

    if (!indexObj || !indexObj.flat) return false;

    // Exact phrase match check (fitur Google: jika cocok utuh, langsung return true)
    const normQuery = normalize(rawQuery);
    if (indexObj.flat.includes(normQuery)) return true;
    const compQuery = stripPunct(rawQuery);
    if (compQuery.length >= 3 && indexObj.compact && indexObj.compact.includes(compQuery)) return true;

    const tokens = parseQuery(rawQuery);
    if (!tokens.length) return true;

    // Logika Multi-token: Setiap token non-stopword harus cocok pada indeks
    const nonStop = tokens.filter((t) => !t.isStopword);
    const targetTokens = nonStop.length > 0 ? nonStop : tokens;

    for (const token of targetTokens) {
      if (!tokenMatches(indexObj, token)) {
        return false;
      }
    }
    return true;
  }

  const jpSearch = {
    buildIndex: buildIndex,
    test: test,
    matchesQuery: function (track, rawQuery) {
      return test(track, rawQuery);
    },
    parseQuery: parseQuery,
    katakanaToHiragana: katakanaToHiragana,
    hiraganaToKatakana: hiraganaToKatakana,
    kanaToRomaji: kanaToRomaji,
    romajiToKana: romajiToKana,
    unifyRomaji: unifyRomaji,
    normalize: normalize,
    stripPunct: stripPunct
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = jpSearch;
  }
  if (typeof window !== 'undefined') {
    window.jpSearch = jpSearch;
    window.JPSearch = jpSearch;
  } else if (typeof global !== 'undefined') {
    global.jpSearch = jpSearch;
    global.JPSearch = jpSearch;
  }
})(typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : this);
