#!/usr/bin/env -S npx tsx
/**
 * Z-World 紫微排盘 CLI。
 *
 * 唯一职责：把出生信息变成「可被 LLM 直接引用的事实」，不做解读。
 * 排盘引擎来自 Renhuai123/ziwei-doushu（MIT），口径由其回归测试保证。
 *
 * 用法：
 *   npx tsx cli.ts --json '{"date":"1990-01-01","time":"08:00","gender":"male","city":"杭州"}'
 *   npx tsx cli.ts --json '{"date":"1990-01-01","hour":6,"gender":"female","city":"成都","liunian":2026}'
 *   echo '{...}' | npx tsx cli.ts
 *   npx tsx cli.ts --selftest
 *
 * 退出码：0 正常，2 输入错误，3 自检失败。
 */
import { generateChart } from './lib/ziwei/algorithm';
import {
  calculateTrueSolarTime,
  resolveZiweiDayOffset,
  shiftGregorianDate,
  isValidGregorianDate,
} from './lib/ziwei/true-solar-time';
import { isChinaDST } from './lib/ziwei/dst-cn';
import { PROVINCES } from './lib/ziwei/cities';
import { detectPatterns, getMingGongSummary } from './lib/ziwei/patterns';
import {
  getLiuNianSiHua,
  getDaXianSiHua,
  getYearStemIndex,
  getYearBranchIndex,
  buildAllSelfSihua,
  findIncomingPalaces,
  getSiHuaByStem,
} from './lib/ziwei/sihua';
import { getDaXianIndexForYear } from './lib/ziwei/yunxian-context';
import { BRANCHES, STEMS, SHICHEN, STAR_DESCRIPTIONS, SI_HUA_TABLE } from './lib/ziwei/constants';
import type { BirthInfo, ZiweiChart, Palace } from './lib/ziwei/types';
import { mkdirSync, writeFileSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

type Gender = 'male' | 'female';
type LateZishiRule = 'next-day' | 'current-day';
type LeapPolicy = 'split' | 'next-month' | 'prev-month' | 'origin-month';

interface Input {
  /** 公历出生日期 YYYY-MM-DD */
  date?: string;
  year?: number;
  month?: number;
  day?: number;
  /** 钟表时间 HH:MM（北京时间，除非传 utcOffsetMinutes） */
  time?: string;
  /** 或直接给时辰地支索引 0-11（0=子 … 11=亥）；给了 time 时忽略 */
  hour?: number;
  gender: Gender;
  /** 出生城市名，用于查经度做真太阳时校正（可只写市级，如「杭州」） */
  city?: string;
  /** 或直接给经度（东经为正） */
  longitude?: number;
  /** 海外出生时区标准偏移（分钟，东正西负）；国内不传 */
  utcOffsetMinutes?: number;
  /** 晚子时口径，默认 next-day */
  lateZishi?: LateZishiRule;
  /** 闰月口径，默认 split（月中分界） */
  leapMonth?: LeapPolicy;
  /** 夏令时：默认 'warn'（只提示不扣），'honor' 表示本人确认按夏令时扣 60 分钟 */
  dst?: 'warn' | 'honor' | 'ignore';
  /** 要看的流年年份，默认今年 */
  liunian?: number;
}

const BR = BRANCHES;

function findCityLongitude(city: string): { longitude: number; province: string; city: string } | null {
  const q = city.replace(/(市|区|县)$/u, '');
  let fuzzy: { longitude: number; province: string; city: string } | null = null;
  for (const p of PROVINCES) {
    for (const c of p.cities) {
      if (c.name === q || c.name === city) return { longitude: c.longitude, province: p.name, city: c.name };
      if (!fuzzy && (c.name.includes(q) || q.includes(c.name))) {
        fuzzy = { longitude: c.longitude, province: p.name, city: c.name };
      }
    }
  }
  return fuzzy;
}

function parseDate(input: Input): { year: number; month: number; day: number } {
  if (input.date) {
    const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(input.date.trim());
    if (!m) throw new Error(`date 必须是 YYYY-MM-DD：${input.date}`);
    return { year: +m[1], month: +m[2], day: +m[3] };
  }
  if (input.year && input.month && input.day) {
    return { year: input.year, month: input.month, day: input.day };
  }
  throw new Error('缺少出生日期：请给 date 或 year/month/day');
}

function parseClock(input: Input): { hour: number; minute: number } | null {
  if (input.time) {
    const m = /^(\d{1,2}):(\d{2})$/.exec(input.time.trim());
    if (!m) throw new Error(`time 必须是 HH:MM：${input.time}`);
    const hour = +m[1];
    const minute = +m[2];
    if (hour > 23 || minute > 59) throw new Error(`time 越界：${input.time}`);
    return { hour, minute };
  }
  return null;
}

interface ChartResult {
  input: Record<string, unknown>;
  timeCorrection: Record<string, unknown>;
  chart: ZiweiChart;
  facts: Record<string, unknown>;
}

function build(input: Input): ChartResult {
  if (input.gender !== 'male' && input.gender !== 'female') {
    throw new Error('gender 必须是 male 或 female');
  }
  const { year, month, day } = parseDate(input);
  const clock = parseClock(input);
  if (!isValidGregorianDate(year, month, day)) {
    throw new Error(`公历日期不存在：${year}-${month}-${day}`);
  }
  const notes: string[] = [];

  // ── 出生地经度 ──
  let longitude = input.longitude;
  let cityInfo: Record<string, unknown> | null = null;
  if (longitude === undefined && input.city) {
    const hit = findCityLongitude(input.city);
    if (!hit) {
      notes.push(`未在引擎城市表里找到「${input.city}」，已跳过真太阳时校正；如需校正请直接传 longitude`);
    } else {
      longitude = hit.longitude;
      cityInfo = { ...hit, query: input.city };
    }
  }

  // ── 夏令时判定（只判定，是否扣减由 dst 决定）──
  const dstHit = isChinaDST(year, month, day);
  let dstApplied = false;
  let clockHour = clock?.hour;
  let clockMinute = clock?.minute;
  if (dstHit) {
    if (input.dst === 'honor' && clock) {
      clockHour = clock.hour - 1;
      if (clockHour < 0) {
        clockHour += 24;
        const prev = shiftGregorianDate({ year, month, day }, -1);
        notes.push(`夏令时扣 1 小时后跨日：钟表 ${String(clock.hour).padStart(2, '0')}:${String(clock.minute).padStart(2, '0')} → 前一日 ${String(clockHour).padStart(2, '0')}:${String(clock.minute).padStart(2, '0')}，请确认日期`);
        void prev;
      }
      dstApplied = true;
      notes.push('已按本人确认扣减夏令时 60 分钟');
    } else {
      notes.push(
        '出生日期落在中国夏令时期间（1986–1991）。引擎默认不自动扣 1 小时：' +
        '若记忆中的时间就是当年钟表读数，请确认后以 dst:"honor" 重跑；若已是标准时间则保持现状。',
      );
    }
  }

  // ── 定排盘日与时辰 ──
  let solarDate = { year, month, day };
  let hourIndex: number;
  let solarInfo: Record<string, unknown> | null = null;

  if (clock && clockHour !== undefined && clockMinute !== undefined) {
    const solar = calculateTrueSolarTime({
      year,
      month,
      day,
      clockHour,
      clockMinute,
      longitude,
      utcOffsetMinutes: input.utcOffsetMinutes,
    });
    if (!solar.dateValid) throw new Error(`公历日期不存在：${year}-${month}-${day}`);
    const lateZishi: LateZishiRule = input.lateZishi ?? 'next-day';
    const dayOffset = resolveZiweiDayOffset(solar, lateZishi);
    solarDate = shiftGregorianDate({ year, month, day }, dayOffset);
    hourIndex = solar.branch;
    solarInfo = {
      clock: `${String(clockHour).padStart(2, '0')}:${String(clockMinute).padStart(2, '0')}`,
      trueSolar: `${String(solar.hour).padStart(2, '0')}:${String(solar.minute).padStart(2, '0')}`,
      longitudeCorrectionMinutes: round1(solar.longitudeCorrectionMinutes),
      equationOfTimeMinutes: round1(solar.equationOfTimeMinutes),
      totalCorrectionMinutes: round1(solar.totalCorrectionMinutes),
      dayOffset,
      lateZishiRule: lateZishi,
      shichen: SHICHEN[hourIndex],
      corrected: solar.corrected,
    };
    if (dayOffset !== 0) {
      notes.push(
        `排盘日相对输入日偏移 ${dayOffset} 天：${year}-${pad(month)}-${pad(day)} → ${solarDate.year}-${pad(solarDate.month)}-${pad(solarDate.day)}`,
      );
    }
    if (solar.corrected && Math.abs(solar.totalCorrectionMinutes) > 0) {
      notes.push(
        `真太阳时校正 ${signed(solar.totalCorrectionMinutes)} 分钟（经度 ${signed(solar.longitudeCorrectionMinutes)} + 均时差 ${signed(solar.equationOfTimeMinutes)}）`,
      );
    }
  } else if (typeof input.hour === 'number') {
    if (!Number.isInteger(input.hour) || input.hour < 0 || input.hour > 11) {
      throw new Error('hour 必须是 0–11 的时辰地支索引（0=子 … 11=亥），不是钟点');
    }
    hourIndex = input.hour;
    notes.push('按给定时辰索引排盘，未做真太阳时校正');
  } else {
    throw new Error('缺少出生时间：请给 time（HH:MM）或 hour（时辰索引 0–11）');
  }

  const birthInfo: BirthInfo = {
    year: solarDate.year,
    month: solarDate.month,
    day: solarDate.day,
    hour: hourIndex,
    gender: input.gender,
    city: cityInfo ? String((cityInfo as { city: string }).city) : undefined,
    longitude,
  };
  const chart = generateChart(birthInfo, { leapMonth: input.leapMonth });
  const liunianYear = input.liunian ?? new Date().getFullYear();

  return {
    input: {
      date: `${year}-${pad(month)}-${pad(day)}`,
      time: clock ? `${pad(clock.hour)}:${pad(clock.minute)}` : `时辰索引 ${hourIndex}`,
      gender: input.gender,
      city: input.city ?? null,
      longitude: longitude ?? null,
      dstHonored: dstApplied,
      liunian: liunianYear,
    },
    timeCorrection: { city: cityInfo, solar: solarInfo, dst: { inDST: dstHit, applied: dstApplied }, notes },
    chart,
    facts: buildFacts(chart, liunianYear),
  };
}

function buildFacts(chart: ZiweiChart, liunianYear: number): Record<string, unknown> {
  const mingPalace = chart.palaces.find(p => p.branch === chart.mingGongBranch)!;
  const shenPalace = chart.palaces.find(p => p.branch === chart.shenGongBranch)!;
  const dxIndex = getDaXianIndexForYear(chart, liunianYear);
  const dx = dxIndex >= 0 ? chart.daXians[dxIndex] : null;
  const dxSihua = dxIndex >= 0 ? getDaXianSiHua(chart, dxIndex, liunianYear) : null;
  // 宫干自化：引擎不填这个字段，由 sihua.ts 现算（倪师体系核心）
  const selfSihuaByBranch = buildAllSelfSihua(chart);

  const palaces = chart.palaces.map(p => {
    const sanFang = [p.branch, (p.branch + 4) % 12, (p.branch + 8) % 12, (p.branch + 6) % 12];
    return {
      branch: BR[p.branch],
      stem: STEMS[p.stem],
      ganzhi: `${STEMS[p.stem]}${BR[p.branch]}`,
      name: p.name,
      isMingGong: !!p.isMingGong,
      isShenGong: !!p.isShenGong,
      isEmpty: !!p.isEmpty,
      borrowedFrom: p.borrowedFromName ?? null,
      borrowedStars: p.borrowedStars ?? [],
      daXianAge: p.daXianAge ?? null,
      stars: p.stars.map(s => ({
        name: s.name,
        type: s.type,
        brightness: s.brightnessRaw ?? s.brightness ?? null,
        brightness3: s.brightness ?? null,
        sihua: s.siHua ?? null,
        keywords: STAR_DESCRIPTIONS[s.name]?.keywords ?? null,
      })),
      selfSihua: (selfSihuaByBranch[p.branch] ?? []).map(x => `${x.starName}化${x.siHua}`),
      sanFangSiZheng: sanFang.map(b => chart.palaces.find(q => q.branch === b)?.name ?? ''),
    };
  });

  return {
    solarDate: chart.birthInfo,
    lunar: {
      text: `${chart.lunarInfo.lunarYear}年${Math.abs(chart.lunarInfo.lunarMonth)}月${chart.lunarInfo.lunarDay}日${chart.lunarInfo.isLeapMonth ? '（闰月）' : ''}`,
      fourPillars: chart.lunarInfo.fourPillars ?? null,
      fourPillarsLunar: chart.lunarInfo.fourPillarsLunar ?? null,
    },
    bureau: chart.wuxingJuName,
    mingZhu: chart.mingZhu ?? null,
    shenZhu: chart.shenZhu ?? null,
    yinYangGender: chart.yinYangGender ?? null,
    mingGong: { branch: BR[chart.mingGongBranch], name: mingPalace.name, stars: mingPalace.stars.filter(s => s.type === 'major').map(s => s.name) },
    shenGong: { branch: BR[chart.shenGongBranch], name: shenPalace.name },
    ziweiPos: BR[chart.ziweiPos],
    // ★ 生年四化按农历年干（chart.lunarInfo.yearStem），不是公历年干。
    //   例：公历 1990-01-01 属农历己巳年，四化应按「己」，按公历算会错成「庚」。
    birthSihua: {
      stem: STEMS[chart.lunarInfo.yearStem],
      ...siHuaOf(chart.lunarInfo.yearStem),
    },
    palaceSihua: palaces.map(p => ({ palace: p.name, selfSihua: p.selfSihua })).filter(x => x.selfSihua.length > 0),
    // 来因宫：生年四化每一化，是哪个宫的宫干飞出来的（倪师体系用来追根源）
    laiYin: buildLaiYin(chart),
    palaces,
    daXians: chart.daXians.map((d, i) => ({
      index: i,
      age: `${d.startAge}–${d.endAge}`,
      palace: d.palaceName,
      branch: BR[d.palaceBranch],
      stem: d.stemName ?? null,
      siHua: d.siHua ? { 禄: d.siHua.lu, 权: d.siHua.quan, 科: d.siHua.ke, 忌: d.siHua.ji } : null,
    })),
    liunian: {
      year: liunianYear,
      stemBranch: `${STEMS[getYearStemIndex(liunianYear)]}${BR[getYearBranchIndex(liunianYear)]}`,
      age: liunianYear - chart.birthInfo.year + 1,
      daXianIndex: dxIndex,
      daXian: dx ? { age: `${dx.startAge}–${dx.endAge}`, palace: dx.palaceName } : null,
      daXianSihua: dxSihua ? { stem: dxSihua.stemName, ...dxSihua.transforms } : null,
      liuNianSihua: (() => {
        const s = getLiuNianSiHua(liunianYear);
        return { stem: s.stemName, ...s.transforms };
      })(),
    },
    patterns: detectPatterns(chart).map(p => ({
      name: p.name,
      level: p.level,
      description: p.description,
      palaces: p.palaces,
      source: p.source ?? null,
      breaking: p.conditions?.breaking ?? [],
    })),
    mingGongSummary: getMingGongSummary(chart),
  };
}

function buildLaiYin(chart: ZiweiChart): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = [];
  for (const sh of ['禄', '权', '科', '忌'] as const) {
    const star = getSiHuaByStem(chart.lunarInfo.yearStem)[sh];
    if (!star) continue;
    const from = findIncomingPalaces(chart, star, sh);
    out.push({
      siHua: sh,
      star,
      fromPalaces: from.map(p => `${p.name}(${STEMS[p.stem]}${BR[p.branch]})`),
    });
  }
  return out;
}

function siHuaOf(stemIndex: number): Record<string, string> {
  const t = SI_HUA_TABLE[stemIndex] ?? ['', '', '', ''];
  return { 禄: t[0], 权: t[1], 科: t[2], 忌: t[3] };
}

const pad = (n: number) => String(n).padStart(2, '0');
const round1 = (n: number) => Math.round(n * 10) / 10;
const signed = (n: number) => `${n > 0 ? '+' : ''}${round1(n)}`;



// ───────────────────── 引证查询（cite）─────────────────────
/**
 * 从本机倪师原话语料里按时间码/关键词取原文。
 * 存在的意义：模型容易「凭印象说某讲讲过X，再配一个时间码」，结果时间码真、内容假。
 * 强制走这里取原文，引文就不会串。
 */
function cite(query: string, partFilter?: string, limit = 8): number {
  const root = join(fileURLToPath(new URL('.', import.meta.url)), 'docs', 'tianji-ziwei');
  const isTime = /^\d{1,2}:\d{2}:\d{2}$/.test(query);
  const norm = (t: string) => t.split(':').map(x => x.padStart(2, '0')).join(':');
  const q = isTime ? norm(query) : query;
  const hits: string[] = [];
  let files: string[] = [];
  try {
    files = readdirSync(root).filter(f => f.endsWith('.md') && !/^README|^LICENSE/.test(f));
  } catch {
    console.error(`找不到语料目录：${root}`);
    return 2;
  }
  for (const f of files.sort()) {
    const lecture = f.replace(/\.md$/, '');
    const lines = readFileSync(join(root, f), 'utf8').split('\n');
    for (const line of lines) {
      const m = /^- \[(\d{1,2}:\d{2}:\d{2})\]\((https?:\/\/[^)]+)\)\s*「(.*?)」\s*(?:<sub>(.*?)<\/sub>)?/.exec(line);
      if (!m) continue;
      const [, t, url, quote, tag] = m;
      const part = /[?&]p=(\d+)/.exec(url)?.[1] ?? '';
      if (partFilter) {
        const wantPart = /^p?(\d+)$/i.exec(partFilter)?.[1];
        const ok = wantPart ? part === wantPart : lecture === partFilter.replace(/\.md$/, '');
        if (!ok) continue;
      }
      const hit = isTime ? norm(t) === q : (quote.includes(q) || (tag ?? '').includes(q));
      if (!hit) continue;
      hits.push(`【${lecture} / p${part} ${t}】${quote}\n    ${tag ? tag + ' · ' : ''}${url}`);
      if (hits.length >= limit) break;
    }
    if (hits.length >= limit) break;
  }
  if (!hits.length) {
    console.log(`未命中：「${query}」。换关键词（星名/宫位/格局/四化/主题），或换更短的词。`);
    return 1;
  }
  console.log(hits.join('\n\n'));
  console.log(
    `\n（${hits.length} 条。时间码在不同讲里会重复，引用时必须带上 p 编号或讲次，` +
      `写成「p23 00:27:27」这种形式；原文照抄，不要改写。）`,
  );
  return 0;
}

// ───────────────────── 解读线索（digest）─────────────────────
/** 六煞 / 六吉：看命宫与各宫的成色 */
const SIX_SHA = ['擎羊', '陀罗', '火星', '铃星', '地空', '地劫'];
const SIX_JI = ['文昌', '文曲', '左辅', '右弼', '天魁', '天钺'];
const ZHONG_DI = ['命宫', '夫妻', '官禄', '财帛', '疾厄', '迁移', '福德', '田宅'];

interface DigestPalace {
  name: string;
  branch: string;
  stem: string;
  stars: string;
  major: string[];
  sha: string[];
  ji: string[];
  isEmpty: boolean;
  borrowedStars: string[];
  selfSihua: string[];
}

function digestFacts(f: Record<string, any>, c: ZiweiChart): string {
  const L: string[] = [];
  const P = (f.palaces as Array<Record<string, any>>);
  const star7 = (s: Record<string, any>) => `${s.name}${s.brightness ? `(${s.brightness})` : ''}${s.sihua ? `化${s.sihua}` : ''}`;
  const byName = (n: string) => P.find(p => p.name === n)!;

  L.push('## 定位');
  L.push(
    `- 农历 ${f.lunar.text}｜${f.lunar.fourPillars?.join(' ')}｜${f.bureau}｜${f.yinYangGender}｜命主${f.mingZhu} 身主${f.shenZhu}`,
  );
  const mingP = byName('命宫');
  const shenP = P.find(p => p.isShenGong)!;
  L.push(
    `- 命宫 ${mingP.branch}：${(mingP.stars as Array<Record<string, any>>).filter(s => s.type === 'major').map(star7).join('、') || '空宫'}${mingP.isEmpty ? `（借${mingP.borrowedFrom}：${(mingP.borrowedStars as string[]).join('、')}）` : ''}`,
  );
  L.push(`- 身宫 ${shenP.name}(${shenP.branch})${shenP.name === '命宫' ? '：身命同宫' : ''}`);

  L.push('');
  L.push('## 十二宫');
  for (const p of P) {
    const stars = (p.stars as Array<Record<string, any>>).map(star7).join(' ');
    const tags: string[] = [];
    if ((p.stars as Array<Record<string, any>>).length === 0) tags.push('空宫');
    if (p.isEmpty) tags.push(`借${p.borrowedFrom}`);
    if ((p.selfSihua as string[]).length) tags.push(`自化:${(p.selfSihua as string[]).join(',')}`);
    if (p.daXianAge) tags.push(`限${(p.daXianAge as number[]).join('-')}`);
    L.push(`- ${p.name} ${p.branch}${p.stem}｜${stars || '（无星）'}${tags.length ? '｜' + tags.join(' ') : ''}`);
  }

  L.push('');
  L.push('## 吉煞分布（六吉/六煞）');
  for (const name of ZHONG_DI) {
    const p = byName(name);
    const all = p.stars as Array<Record<string, any>>;
    const sha = all.filter(s => SIX_SHA.includes(s.name)).map(s => `${s.name}${s.brightness ? `(${s.brightness})` : ''}`);
    const ji = all.filter(s => SIX_JI.includes(s.name)).map(s => s.name);
    if (sha.length || ji.length) L.push(`- ${name}：吉 ${ji.join('、') || '—'}｜煞 ${sha.join('、') || '—'}`);
  }

  L.push('');
  L.push('## 四化');
  const bs = f.birthSihua as Record<string, string>;
  const locate = (star: string) => P.find(p => (p.stars as Array<Record<string, any>>).some(s => s.name === star))?.name ?? '—';
  L.push(
    `- 生年 ${bs.stem}：禄${bs['禄']}→${locate(bs['禄'])}｜权${bs['权']}→${locate(bs['权'])}｜科${bs['科']}→${locate(bs['科'])}｜忌${bs['忌']}→${locate(bs['忌'])}`,
  );
  if ((f.palaceSihua as unknown[]).length) {
    L.push(`- 宫干自化：${(f.palaceSihua as Array<{ palace: string; selfSihua: string[] }>).map(x => `${x.palace} ${x.selfSihua.join(',')}`).join('｜')}`);
  }
  L.push(`- 来因宫：${(f.laiYin as Array<Record<string, any>>).map(x => `${x.siHua}${x.star}←${(x.fromPalaces as string[]).join('/')}`).join('｜')}`);

  L.push('');
  L.push('## 运限');
  const ln = f.liunian as Record<string, any>;
  L.push(`- 当前大限：${ln.daXian?.age ?? '—'} ${ln.daXian?.palace ?? ''}｜大限四化 ${ln.daXianSihua ? Object.entries(ln.daXianSihua).filter(([k]) => k !== 'stem').map(([k, v]) => k + v).join(' ') : '—'}`);
  L.push(`- 流年 ${ln.year} ${ln.stemBranch}（虚岁${ln.age}）：${Object.entries(ln.liuNianSihua as Record<string, string>).filter(([k]) => k !== 'stem').map(([k, v]) => k + v).join(' ')}`);
  L.push(`- 大限时间轴：${(f.daXians as Array<Record<string, any>>).map(d => `${d.age}${d.palace}`).join(' ')}`);

  L.push('');
  L.push('## 格局（只讲这些）');
  for (const pt of f.patterns as Array<Record<string, any>>) {
    L.push(`- ${pt.name}｜${pt.level}｜${pt.description}${(pt.breaking as string[]).length ? `｜破格：${(pt.breaking as string[]).join('、')}` : ''}`);
  }
  if (!(f.patterns as unknown[]).length) L.push('- 无经典格局命中');

  L.push('');
  L.push('## 事实提示（不是结论）');
  const shaHeavy = [...P].sort((a, b) => (b.sha?.length ?? 0) - (a.sha?.length ?? 0))[0];
  const shaCount = (shaHeavy.stars as Array<Record<string, any>>).filter(s => SIX_SHA.includes(s.name)).length;
  if (shaCount >= 2) L.push(`- 煞星最集中：${shaHeavy.name}（${(shaHeavy.stars as Array<Record<string, any>>).filter(s => SIX_SHA.includes(s.name)).map(s => s.name).join('、')}）——倪师法：健康看全盘杀星最集中之宫，按该宫地支对应脏腑`);
  const dims = P.flatMap(p => (p.stars as Array<Record<string, any>>).filter(s => s.brightness === '陷').map(s => `${p.name}·${s.name}`));
  if (dims.length) L.push(`- 落陷星：${dims.join('、')}`);
  const empties = P.filter(p => (p.stars as Array<Record<string, any>>).every(s => s.type !== 'major')).map(p => p.name);
  if (empties.length) L.push(`- 无主星之宫：${empties.join('、')}（力道借对宫，打折扣）`);
  const mingSha = (mingP.stars as Array<Record<string, any>>).filter(s => SIX_SHA.includes(s.name)).map(s => s.name);
  if (mingSha.length) L.push(`- 命宫坐煞：${mingSha.join('、')}`);
  L.push(`- 用户问题需要落到：${mingP.name}主星 → 三方四正 → 四化落点 → 对应宫位 → 运限`);
  void c;
  return L.join('\n');
}

// ───────────────────── CLI ─────────────────────
async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const c of process.stdin) chunks.push(c as Buffer);
  return Buffer.concat(chunks).toString('utf8');
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.includes('--selftest')) return selftest();
  const citeIdx = argv.indexOf('--cite');
  if (citeIdx >= 0) {
    const q = argv[citeIdx + 1];
    if (!q) {
      console.error('用法：--cite <时间码 | 关键词> [讲次或 pN]');
      process.exit(2);
    }
    const nxt = argv[citeIdx + 2];
    const filter = nxt && !nxt.startsWith('--') ? nxt : undefined;
    process.exit(cite(q, filter));
  }
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log(
      [
        'ziwei CLI — 紫微斗数排盘（只给事实，不做解读）',
        '',
        'npx tsx cli.ts --json \'{"date":"1990-01-01","time":"08:00","gender":"male","city":"杭州"}\'',
        'echo \'{...}\' | npx tsx cli.ts',
        'npx tsx cli.ts --digest --json \'{...}\'   # 只要解读线索（约 3KB，供解读用）',
        'npx tsx cli.ts --json-out /tmp/pan.json --json \'{...}\'',
        'npx tsx cli.ts --cite 00:27:27            # 引证：按时间码取倪师原话原文',
        'npx tsx cli.ts --cite 巨门 p7              # 按关键词 + 讲次精确定位',
        'npx tsx cli.ts --selftest',
        '',
        '字段：date|year/month/day, time|hour, gender(必填), city|longitude,',
        '      utcOffsetMinutes, lateZishi(next-day|current-day), leapMonth,',
        '      dst(warn|honor|ignore), liunian',
      ].join('\n'),
    );
    return;
  }
  let raw = '';
  const i = argv.indexOf('--json');
  if (i >= 0) raw = argv[i + 1] ?? '';
  else if (!process.stdin.isTTY) raw = await readStdin();
  if (!raw.trim()) {
    console.error('缺少输入。用 --json \'{...}\' 或 stdin；--help 查看字段。');
    process.exit(2);
  }
  let input: Input;
  try {
    input = JSON.parse(raw) as Input;
  } catch (e) {
    console.error(`输入不是合法 JSON：${(e as Error).message}`);
    process.exit(2);
  }
  const out = build(input);

  // 无论哪种输出，都把完整盘面缓存一份，方便后续追问时不用重排
  const cacheDir = '/tmp/zw-ziwei-cache';
  const timeKey = String(out.input.time).includes('时辰') ? `h${out.chart.birthInfo.hour}` : String(out.input.time);
  const key = [
    out.input.date,
    timeKey,
    out.input.gender,
    out.input.city ?? out.input.longitude ?? 'nocity',
  ].join('_').replace(/[\\/:%*?"<>| ]/g, '-');
  const jsonOutIdx = argv.indexOf('--json-out');
  const cachePath = jsonOutIdx >= 0 ? (argv[jsonOutIdx + 1] ?? join(cacheDir, `${key}.json`)) : join(cacheDir, `${key}.json`);
  try {
    mkdirSync(cacheDir, { recursive: true });
    writeFileSync(cachePath, JSON.stringify(out, null, 2), 'utf8');
  } catch {
    /* 缓存失败不影响主流程 */
  }

  if (argv.includes('--digest')) {
    console.log(digestFacts(out.facts as Record<string, any>, out.chart));
    console.log(`\n（完整盘面 JSON：${cachePath}）`);
    return;
  }
  console.log(JSON.stringify(out, null, 2));
}

function selftest() {
  const cases: Array<{ input: Input; check: (r: ChartResult) => string | null }> = [
    {
      input: { date: '1990-01-01', hour: 0, gender: 'male' },
      check: r =>
        r.chart.lunarInfo.lunarYear === 1989 &&
        r.chart.palaces.find(p => p.name === '命宫')?.stars.some(s => s.name === '天府')
          ? null
          : '期望 1989 农历、命宫天府',
    },
    {
      input: { date: '1988-06-15', time: '14:30', gender: 'female', city: '北京' },
      check: r => (r.timeCorrection.solar ? null : '期望有真太阳时结果'),
    },
    {
      input: { date: '1990-05-09', time: '23:55', gender: 'male' },
      check: r => (r.chart.birthInfo.day === 10 ? null : '期望晚子时换日到 5/10'),
    },
  ];
  let fail = 0;
  for (const c of cases) {
    try {
      const r = build(c.input);
      const err = c.check(r);
      if (err) {
        fail++;
        console.log(`❌ ${JSON.stringify(c.input)} → ${err}`);
      } else {
        console.log(`✅ ${JSON.stringify(c.input)}`);
      }
    } catch (e) {
      fail++;
      console.log(`❌ ${JSON.stringify(c.input)} → 抛错 ${(e as Error).message}`);
    }
  }
  // 非真实日期必须拒绝
  try {
    build({ date: '1990-02-30', hour: 0, gender: 'male' });
    fail++;
    console.log('❌ 2 月 30 日应被拒绝却通过了');
  } catch {
    console.log('✅ 拒绝不存在的公历日期');
  }
  if (fail) {
    console.log(`\n${fail} 项失败`);
    process.exit(3);
  }
  console.log('\n全部通过');
}

main().catch(e => {
  console.error(`错误：${(e as Error).message}`);
  process.exit(2);
});
