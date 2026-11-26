/**
 * Time-aware greetings in English, Swahili, Kenyan Sheng and local languages.
 * A new greeting is picked each time the dashboard mounts (i.e. on each login).
 */

const TIME_SEGMENTS = [
  { key: "lateNight", from: 0, to: 5, label: "Late night" },
  { key: "earlyMorning", from: 5, to: 8, label: "Early morning" },
  { key: "morning", from: 8, to: 11, label: "Morning" },
  { key: "midmorning", from: 11, to: 12, label: "Mid-morning" },
  { key: "lunch", from: 12, to: 14, label: "Lunchtime" },
  { key: "afternoon", from: 14, to: 17, label: "Afternoon" },
  { key: "evening", from: 17, to: 20, label: "Evening" },
  { key: "night", from: 20, to: 24, label: "Night" },
];

const GREETINGS = {
  English: {
    lateNight: ["Still up? Good night", "Burning the midnight oil?"],
    earlyMorning: ["Good early morning", "Up with the sun?"],
    morning: ["Good morning", "Lovely morning"],
    midmorning: ["Good mid-morning", "Morning is flying by"],
    lunch: ["Happy lunchtime", "Hope lunch treats you well"],
    afternoon: ["Good afternoon", "A productive afternoon to you"],
    evening: ["Good evening", "A calm evening to you"],
    night: ["Good night", "Rest well tonight"],
  },
  Swahili: {
    lateNight: ["Usiku mwema", "Bado usingizini? Usiku mwema"],
    earlyMorning: ["Asubuhi njema sana", "Habari za mapema?"],
    morning: ["Habari za asubuhi", "Asubuhi njema"],
    midmorning: ["Asubuhi njema", "Habari za leo?"],
    lunch: ["Habari za mchana", "Chakula chema"],
    afternoon: ["Mchana mwema", "Habari za alasiri?"],
    evening: ["Jioni njema", "Habari za jioni?"],
    night: ["Usiku mwema", "Lala vizuri"],
  },
  Sheng: {
    lateNight: ["Sasa, bado uko live?", "Usiku, pole sana"],
    earlyMorning: ["Niaje, asubuhi?", "Kiamu, mambo?"],
    morning: ["Mambo, asubuhi njema?", "Niaje leo?"],
    midmorning: ["Sasa, kiamu?", "Vibe njema?"],
    lunch: ["Habari za chakula?", "Kula mbegu, mambo?"],
    afternoon: ["Mambo, mchana?", "Sasa, uko fiti?"],
    evening: ["Niaje, jioni?", "Vibe za jioni?"],
    night: ["Usiku, pole", "Tuliza, kesho kutamu"],
  },
  Kikuyu: {
    lateNight: ["Thaai", "Nĩmũwega usiku"],
    earlyMorning: ["Nĩmũwega", "Wakĩrĩrũa?"],
    morning: ["Nĩmũwega", "Wariũ?"],
    midmorning: ["Wariũ?", "Nĩmũwega mũno"],
    lunch: ["Nĩmũwega", "Thaai"],
    afternoon: ["Thaai", "Nĩmũwega"],
    evening: ["Nĩmũwega", "Wariũ?"],
    night: ["Thaai", "Nĩmũwega usiku"],
  },
  Luo: {
    lateNight: ["Ber ber", "Nade?"],
    earlyMorning: ["Nade?", "Ber ber"],
    morning: ["Nade? Ber ber", "Oyalo?"],
    midmorning: ["Ber ber", "Nade?"],
    lunch: ["Ber ber", "Chiemo maber"],
    afternoon: ["Nade?", "Ber ber"],
    evening: ["Ber ber", "Nade?"],
    night: ["Ber ber", "Yubo maber"],
  },
  Luhya: {
    lateNight: ["Wakhuli?", "Mukama akupakhe"],
    earlyMorning: ["Wakhuli?", "Mukama akupakhe"],
    morning: ["Wakhuli?", "Mukama akupakhe"],
    midmorning: ["Wakhuli?", "Mukama akupakhe"],
    lunch: ["Wakhuli?", "Mukama akupakhe"],
    afternoon: ["Wakhuli?", "Mukama akupakhe"],
    evening: ["Wakhuli?", "Mukama akupakhe"],
    night: ["Wakhuli?", "Mukama akupakhe"],
  },
  Maasai: {
    lateNight: ["Sopa", "Sopa, esipa"],
    earlyMorning: ["Sopa", "Sopa, enkare"],
    morning: ["Sopa", "Sopa, asubuhi"],
    midmorning: ["Sopa", "Sopa"],
    lunch: ["Sopa", "Sopa, ilchak"],
    afternoon: ["Sopa", "Sopa"],
    evening: ["Sopa", "Sopa, eKevin"],
    night: ["Sopa", "Sopa, esipa"],
  },
  Somali: {
    lateNight: ["Habeen wanaagsan", "Salaam"],
    earlyMorning: ["Subax wanaagsan", "Salaam"],
    morning: ["Subax wanaagsan", "Ma fiican tahay?"],
    midmorning: ["Subax wanaagsan", "Salaam"],
    lunch: ["Galab wanaagsan", "Salaam"],
    afternoon: ["Galab wanaagsan", "Ma wanaagsan tahay?"],
    evening: ["Galab wanaagsan", "Salaam"],
    night: ["Habeen wanaagsan", "Hurdo wanaagsan"],
  },
};

function timeSegment(date = new Date()) {
  const hour = date.getHours();
  return (
    TIME_SEGMENTS.find((segment) => hour >= segment.from && hour < segment.to) ||
    TIME_SEGMENTS[0]
  );
}

function pickGreeting(date = new Date()) {
  const segment = timeSegment(date);
  const languages = Object.keys(GREETINGS);
  const language = languages[Math.floor(Math.random() * languages.length)];
  const options = GREETINGS[language][segment.key];
  const text = options[Math.floor(Math.random() * options.length)];
  return {
    text,
    language,
    segment: segment.key,
    segmentLabel: segment.label,
  };
}

export { GREETINGS, TIME_SEGMENTS, timeSegment, pickGreeting };
