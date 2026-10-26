'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

const DEFAULT_MATERIALS = [
  {
    person: '苏轼',
    identity: '北宋文学家、书画家',
    deeds: '元丰二年因“乌台诗案”被贬黄州，于东坡躬耕自适，写下《赤壁赋》《念奴娇·赤壁怀古》等名篇。此后又远谪惠州、儋州，仍修桥引泉、劝农办学，把困顿的日子过成了开阔的天地。',
    quote: '竹杖芒鞋轻胜马，谁怕？一蓑烟雨任平生。',
    source: '《定风波·莫听穿林打叶声》',
    spirit: '旷达自适，坚韧乐观；身处逆境而不失对生活的热爱与对百姓的关切。',
    topics: ['逆境与成长', '豁达', '文化自信', '民生情怀'],
    keywords: ['东坡', '赤壁', '贬谪', '宋词']
  },
  {
    person: '杜甫',
    identity: '唐代诗人',
    deeds: '亲历安史之乱，携家流亡，将所见所感写入“三吏”“三别”。寓居成都草堂时，茅屋为秋风所破，仍推己及人，写下“安得广厦千万间”的呼喊。其诗被后世称为“诗史”。',
    quote: '安得广厦千万间，大庇天下寒士俱欢颜。',
    source: '《茅屋为秋风所破歌》',
    spirit: '忧国忧民，悲悯苍生；以诗笔记录时代，把个人苦难化为对天下人的关怀。',
    topics: ['家国情怀', '人民立场', '苦难与担当', '现实主义'],
    keywords: ['诗圣', '诗史', '草堂', '安史之乱']
  },
  {
    person: '袁隆平',
    identity: '杂交水稻育种专家',
    deeds: '数十年扎根田间，攻克杂交水稻育种难题，推动水稻大幅增产。晚年仍奔走在试验田与推广一线，培养青年科研人员，让“禾下乘凉梦”从愿望走向现实。',
    quote: '人就像种子，要做一粒好种子。',
    source: '袁隆平寄语',
    spirit: '躬耕实践，潜心钻研；以科学造福苍生，把论文写在祖国大地上。',
    topics: ['科技报国', '粮食安全', '坚守', '实干'],
    keywords: ['杂交水稻', '禾下乘凉梦', '科学家精神', '田野']
  },
  {
    person: '张桂梅',
    identity: '云南省丽江市华坪女子高级中学校长',
    deeds: '扎根滇西贫困山区教育一线，四处奔走筹款，于2008年创办全国第一所全免费女子高中。她拖着病体家访数千公里，帮助一批批女孩走出大山、走进大学。',
    quote: '只要还有一口气，就要站在讲台上。',
    source: '张桂梅',
    spirit: '无私奉献，坚韧执着；以教育改变命运，用一束光点亮群山。',
    topics: ['教育公平', '奉献', '女性成长', '理想与信念'],
    keywords: ['华坪女高', '大山', '教师', '家访']
  },
  {
    person: '司马迁',
    identity: '西汉史学家、文学家',
    deeds: '继承父志撰写史书，因李陵之祸受宫刑。他忍辱负重，发愤著书，遍访旧闻、考订史实，最终完成中国第一部纪传体通史《史记》。',
    quote: '人固有一死，或重于泰山，或轻于鸿毛。',
    source: '《报任安书》',
    spirit: '忍辱负重，矢志不渝；秉笔直书，以求真之志守护历史。',
    topics: ['逆境', '使命', '求真', '历史与书写'],
    keywords: ['史记', '太史公', '纪传体', '发愤著书']
  },
  {
    person: '屈原',
    identity: '战国时期楚国诗人、政治家',
    deeds: '曾任楚国左徒，主张举贤授能、联齐抗秦，遭排挤流放。行吟泽畔，仍心系故国，写下《离骚》《九歌》《天问》等作品，以生命守护理想与高洁。',
    quote: '路漫漫其修远兮，吾将上下而求索。',
    source: '《离骚》',
    spirit: '忠贞爱国，洁身自好；为理想上下求索，九死未悔。',
    topics: ['家国', '理想与气节', '求索', '文化传承'],
    keywords: ['楚辞', '离骚', '汨罗江', '端午']
  },
  {
    person: '范仲淹',
    identity: '北宋政治家、文学家',
    deeds: '少时家贫仍苦读不辍。为官后主持“庆历新政”，兴修水利、整顿吏治，虽屡遭贬谪仍以天下为己任，在《岳阳楼记》中写下千古名句。',
    quote: '先天下之忧而忧，后天下之乐而乐。',
    source: '《岳阳楼记》',
    spirit: '以天下为己任，忧乐与共；居官敢为，处逆境而不改其志。',
    topics: ['家国情怀', '担当', '改革', '士人精神'],
    keywords: ['岳阳楼', '庆历新政', '忧乐', '北宋']
  },
  {
    person: '王阳明',
    identity: '明代思想家、军事家',
    deeds: '因仗义执言被贬贵州龙场，在困厄中悟得“心即理”，提出“知行合一”“致良知”。后平定宁王之乱，讲学不辍，将学问落实于日用与事功。',
    quote: '知是行之始，行是知之成。',
    source: '《传习录》',
    spirit: '知行合一，向内求索；在事上磨炼，以行动完成认知。',
    topics: ['知行', '自我修养', '逆境', '实践'],
    keywords: ['心学', '龙场悟道', '传习录', '致良知']
  }
];

class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
    this.status = 400;
  }
}

class NotFoundError extends Error {
  constructor(message) {
    super(message);
    this.name = 'NotFoundError';
    this.status = 404;
  }
}

function cleanText(value, max) {
  if (value == null) return '';
  return String(value).replace(/\r\n/g, '\n').trim().slice(0, max);
}

function cleanList(value, maxItems, maxLength) {
  let parts = [];
  if (Array.isArray(value)) {
    parts = value;
  } else if (typeof value === 'string') {
    parts = value.split(/[,，、;；\n]+/);
  }

  const seen = new Set();
  const result = [];
  for (const part of parts) {
    const item = cleanText(part, maxLength).replace(/^#+/, '');
    if (!item || seen.has(item)) continue;
    seen.add(item);
    result.push(item);
    if (result.length >= maxItems) break;
  }
  return result;
}

function normalizeInput(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new ValidationError('请求内容格式不正确。');
  }

  const data = {
    person: cleanText(raw.person, 40),
    identity: cleanText(raw.identity, 80),
    deeds: cleanText(raw.deeds, 20000),
    quote: cleanText(raw.quote, 1200),
    source: cleanText(raw.source, 120),
    spirit: cleanText(raw.spirit, 1200),
    topics: cleanList(raw.topics, 12, 24),
    keywords: cleanList(raw.keywords, 20, 24)
  };

  if (!data.person) throw new ValidationError('请填写人物。');
  if (!data.deeds && !data.quote && !data.spirit) {
    throw new ValidationError('事迹、语录、精神至少填写一项。');
  }
  return data;
}


function copy(value) {
  return JSON.parse(JSON.stringify(value));
}

function cleanDate(value, fallback) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : date.toISOString();
}

function materialKey(item) {
  return JSON.stringify([
    item.person,
    item.identity,
    item.deeds,
    item.quote,
    item.source,
    item.spirit,
    item.topics,
    item.keywords
  ]);
}

function normalizeSnapshot(rawItems) {
  if (!Array.isArray(rawItems)) {
    throw new ValidationError('备份中的素材列表格式不正确。');
  }
  if (rawItems.length > 5000) {
    throw new ValidationError('备份中的素材数量过多。');
  }

  const now = new Date().toISOString();
  const ids = new Set();

  return rawItems.map((raw, index) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new ValidationError('第 ' + (index + 1) + ' 则素材格式不正确。');
    }

    let data;
    try {
      data = normalizeInput(raw);
    } catch (error) {
      throw new ValidationError('第 ' + (index + 1) + ' 则素材：' + error.message);
    }

    let id = typeof raw.id === 'string' && /^[a-zA-Z0-9-]{1,64}$/.test(raw.id)
      ? raw.id
      : crypto.randomUUID();
    if (ids.has(id)) id = crypto.randomUUID();
    ids.add(id);

    const createdAt = cleanDate(raw.createdAt, now);
    return {
      id,
      ...data,
      createdAt,
      updatedAt: cleanDate(raw.updatedAt, createdAt)
    };
  });
}

function sortByName(a, b) {
  return a.name.localeCompare(b.name, 'zh-CN');
}

class Store {
  constructor(file) {
    this.file = file;
    this.items = [];
    this.queue = Promise.resolve();
  }

  async init() {
    await fs.mkdir(path.dirname(this.file), { recursive: true });
    try {
      const raw = JSON.parse(await fs.readFile(this.file, 'utf8'));
      const list = Array.isArray(raw) ? raw : raw.materials;
      if (!Array.isArray(list)) throw new Error('素材数据格式不正确');
      this.items = list.map((item) => this.withDefaults(item)).filter(Boolean);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      const now = new Date().toISOString();
      this.items = DEFAULT_MATERIALS.map((item) => ({
        id: crypto.randomUUID(),
        ...item,
        createdAt: now,
        updatedAt: now
      }));
      await this.persist(this.items);
    }
  }

  withDefaults(item) {
    if (!item || typeof item !== 'object' || !item.person) return null;
    const now = new Date().toISOString();
    return {
      id: String(item.id || crypto.randomUUID()),
      person: cleanText(item.person, 40),
      identity: cleanText(item.identity, 80),
      deeds: cleanText(item.deeds, 20000),
      quote: cleanText(item.quote, 1200),
      source: cleanText(item.source, 120),
      spirit: cleanText(item.spirit, 1200),
      topics: cleanList(item.topics, 12, 24),
      keywords: cleanList(item.keywords, 20, 24),
      createdAt: item.createdAt || now,
      updatedAt: item.updatedAt || item.createdAt || now
    };
  }

  async persist(items) {
    const tmp = this.file + '.tmp';
    const payload = {
      version: 1,
      savedAt: new Date().toISOString(),
      materials: items
    };
    await fs.writeFile(tmp, JSON.stringify(payload, null, 2) + '\n', 'utf8');
    await fs.rename(tmp, this.file);
  }

  enqueue(operation) {
    const run = this.queue.then(operation);
    this.queue = run.catch(() => {});
    return run;
  }

  list() {
    return this.items.slice();
  }

  find(id) {
    return this.items.find((item) => item.id === id) || null;
  }

  snapshot() {
    return {
      version: 1,
      savedAt: new Date().toISOString(),
      materials: copy(this.items)
    };
  }

  normalizeSnapshot(items) {
    return normalizeSnapshot(items);
  }

  compareImport(items) {
    const existing = new Set(this.items.map(materialKey));
    const matched = new Set();
    const people = [];

    for (const item of items) {
      const key = materialKey(item);
      if (!existing.has(key) || matched.has(key)) continue;
      matched.add(key);
      if (!people.includes(item.person)) people.push(item.person);
    }

    return {
      duplicateCount: matched.size,
      duplicatePeople: people.slice(0, 5)
    };
  }

  async replaceAll(rawItems) {
    const items = normalizeSnapshot(rawItems);
    return this.enqueue(async () => {
      await this.persist(items);
      this.items = items;
      return { total: items.length };
    });
  }

  async mergeAll(rawItems) {
    const incoming = normalizeSnapshot(rawItems);
    return this.enqueue(async () => {
      const existing = new Set(this.items.map(materialKey));
      const seen = new Set();
      const additions = [];

      for (const item of incoming) {
        const key = materialKey(item);
        if (existing.has(key) || seen.has(key)) continue;
        seen.add(key);
        additions.push({ ...item, id: crypto.randomUUID() });
      }

      const next = additions.length ? [...additions, ...this.items] : this.items;
      if (additions.length) {
        await this.persist(next);
        this.items = next;
      }

      return {
        added: additions.length,
        skipped: incoming.length - additions.length,
        total: next.length
      };
    });
  }

  async resetToDefaults() {
    return this.enqueue(async () => {
      const now = new Date().toISOString();
      const items = DEFAULT_MATERIALS.map((item) => ({
        id: crypto.randomUUID(),
        ...copy(item),
        createdAt: now,
        updatedAt: now
      }));
      await this.persist(items);
      this.items = items;
      return { total: items.length };
    });
  }

  facets() {
    const topics = new Map();
    const people = new Map();
    const keywords = new Map();

    for (const item of this.items) {
      for (const topic of item.topics) topics.set(topic, (topics.get(topic) || 0) + 1);
      for (const keyword of item.keywords) keywords.set(keyword, (keywords.get(keyword) || 0) + 1);
      people.set(item.person, (people.get(item.person) || 0) + 1);
    }

    const sortFacet = (map) => [...map.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || sortByName(a, b));

    return {
      topics: sortFacet(topics),
      people: sortFacet(people),
      keywords: sortFacet(keywords),
      stats: {
        materials: this.items.length,
        people: people.size,
        topics: topics.size,
        keywords: keywords.size
      }
    };
  }

  async create(raw) {
    const data = normalizeInput(raw);
    return this.enqueue(async () => {
      const now = new Date().toISOString();
      const item = { id: crypto.randomUUID(), ...data, createdAt: now, updatedAt: now };
      const next = [item, ...this.items];
      await this.persist(next);
      this.items = next;
      return item;
    });
  }

  async update(id, raw) {
    const data = normalizeInput(raw);
    return this.enqueue(async () => {
      const existing = this.find(id);
      if (!existing) throw new NotFoundError('没有找到这则素材。');
      const updated = {
        ...existing,
        ...data,
        updatedAt: new Date().toISOString()
      };
      const next = this.items.map((item) => (item.id === id ? updated : item));
      await this.persist(next);
      this.items = next;
      return updated;
    });
  }

  async remove(id) {
    return this.enqueue(async () => {
      const existing = this.find(id);
      if (!existing) throw new NotFoundError('没有找到这则素材。');
      const next = this.items.filter((item) => item.id !== id);
      await this.persist(next);
      this.items = next;
      return { id };
    });
  }
}

module.exports = { Store, ValidationError, NotFoundError };
