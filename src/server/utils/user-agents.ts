const _randomFrom = <T>(arr: readonly T[]): T =>
  arr[Math.floor(Math.random() * arr.length)];

const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:134.0) Gecko/20100101 Firefox/134.0",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.3 Safari/605.1.15",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36 Edg/132.0.0.0",
  "Mozilla/5.0 (X11; Linux x86_64; rv:134.0) Gecko/20100101 Firefox/134.0",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:133.0) Gecko/20100101 Firefox/133.0",
];

const GSA_SAMSUNG_MODELS = [
  "S8500", "S5230", "S8530", "S8300", "I8910", "S7350", "B7300", "S5600",
  "S8000", "S5330", "C3510", "S5250", "S7220", "S5560", "B3410", "S5620",
  "S3310", "S3370", "S3650", "S5233", "S5260", "S5300", "S5360", "S5380",
  "S5570", "S5660", "S5670", "S5830", "S6500", "S7070", "S7230", "S7550",
  "S7560", "S8600", "B2100", "B2700", "B3210", "B3310", "B5310", "B7320",
  "B7722", "C3011", "C3050", "C3212", "C3300", "C3312", "C3520", "C3530",
  "C3780", "C5220", "C5510", "C6112", "C6712",
];
const GSA_REGIONS = ["XE", "XX", "JF", "XP", "DD", "DV", "XI"];
const GSA_DOLFIN = ["1.5", "2.0", "2.2", "3.0"];
const GSA_SAMSUNG_BROWSERS = ["Dolfin", "Jasmine"];
const GSA_LETTERS = "ABCDEFGHJKL";
const GSA_DIGITS = "0123456789";

const OPERA_MINI_VARIANTS = [
  { version: "6.1", presto: "2.8.119", release: "11.10", platforms: ["J2ME/MIDP"] },
  { version: "7.0", presto: "2.8.119", release: "11.10", platforms: ["J2ME/MIDP"] },
  { version: "7.1", presto: "2.8.119", release: "11.10", platforms: ["J2ME/MIDP"] },
  { version: "4.2", presto: "2.5.25", release: "10.54", platforms: ["S60"] },
];

const _randChars = (n: number, alphabet: string): string =>
  Array.from({ length: n }, () => _randomFrom(alphabet.split(""))).join("");

const _randInt = (min: number, max: number): number =>
  min + Math.floor(Math.random() * (max - min + 1));

const _buildSamsungGsa = (): string => {
  const model = _randomFrom(GSA_SAMSUNG_MODELS);
  const firmware = `${model}${_randomFrom(GSA_REGIONS)}${_randChars(2, GSA_LETTERS)}${_randChars(1, GSA_DIGITS)}`;
  const browser = _randomFrom(GSA_SAMSUNG_BROWSERS);
  const browserVer = browser === "Dolfin" ? _randomFrom(GSA_DOLFIN) : "1.0";
  const engine = browser === "Dolfin" ? "Nextreaming" : "Qtv/5.3";
  return `SAMSUNG-GT-${model}/${firmware} SHP/VPP/R5 ${browser}/${browserVer} ${engine} SMM-MMS/1.2.0 profile/MIDP-2.1 configuration/CLDC-1.1`;
};

const _buildOperaMiniGsa = (): string => {
  const v = _randomFrom(OPERA_MINI_VARIANTS);
  const platform = _randomFrom(v.platforms);
  const build = _randInt(10000, 49999);
  const subMajor = _randInt(20, 49);
  const subMinor = _randInt(100, 3999);
  return `Opera/9.80 (${platform}; Opera Mini/${v.version}.${build}/${subMajor}.${subMinor}; U; en) Presto/${v.presto} Version/${v.release}`;
};

export function getRandomUserAgent(): string {
  return _randomFrom(USER_AGENTS);
}

export const getRandomGsaAgent = (): string =>
  Math.random() < 0.5 ? _buildSamsungGsa() : _buildOperaMiniGsa();
