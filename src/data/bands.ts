/* Canonical band registry. CharacterData.bands lists ids from here; bands[0] is the primary
   unit a dual-affiliation member groups under on the select screen (初华 sings for both
   Ave Mujica and sumimi). A band with no roster members yet stays out of this list until
   someone joins — selfcheck fails on orphan ids and empty bands alike. */

export type BandId =
  | 'mygo' | 'ave-mujica' | 'sumimi' | 'yumemita' | 'pastel-palettes'
  | 'poppin-party' | 'afterglow' | 'roselia' | 'hello-happy' | 'raise-a-suilen' | 'morfonica'
  | 'millsage' | 'ikka-dumb-rock'
  | 'kessoku-band';

/** 作品（IP）。选人界面先按作品排，再按乐队排：BanG Dream! → 孤独摇滚！ → 轻音少女 → Girls Band Cry。
 *  后两个还没有角色，先把顺序定在这里；新作品的角色进名册时按这个顺序接在后面。 */
export type IpId = 'bang-dream' | 'bocchi-the-rock' | 'k-on' | 'girls-band-cry';
export const IPS: readonly IpId[] = ['bang-dream', 'bocchi-the-rock', 'k-on', 'girls-band-cry'];

export interface BandData {
  id: BandId;
  /** Select-screen group title. */
  name: string;
  /** Unit accent for the group header dot; tracks the members' own roster colours. */
  color: string;
  /** Which work the band is from. Unset is BanG Dream!. */
  ip?: IpId;
}

export const BANDS: readonly BandData[] = [
  // Select-screen order. Ave Mujica > MyGO!!!!! > 夢限大みゅーたいぷ is the user's pick; the rest
  // follows the franchise debut order (Poppin'Party 2015 → Roselia → Hello, Happy World!), and
  // sumimi follows the gig bands (idol duo, not an official band). Afterglow is appended after
  // that; on the select screen she sits after Pastel*Palettes, ahead of the bandless.
  { id: 'ave-mujica', name: 'Ave Mujica', color: '#7799CC' },
  { id: 'mygo', name: 'MyGO!!!!!', color: '#77BBDD' },
  { id: 'yumemita', name: '梦限大MewType', color: '#FFEE55' },
  { id: 'poppin-party', name: "Poppin'Party", color: '#FF5522' },
  { id: 'pastel-palettes', name: 'Pastel*Palettes', color: '#FF77CC' },
  { id: 'roselia', name: 'Roselia', color: '#4455BB' },
  { id: 'hello-happy', name: 'Hello, Happy World!', color: '#FFEE22' },
  { id: 'sumimi', name: 'sumimi', color: '#BB9955' },
  { id: 'afterglow', name: 'Afterglow', color: '#EE0022' },
  // 成员显示代号，不用本名。
  { id: 'raise-a-suilen', name: 'RAISE A SUILEN', color: '#CC0000' },
  { id: 'morfonica', name: 'Morfonica', color: '#6677CC' },
  // 新团排在末尾；成员进名册前不能留在注册表里（selfcheck 会报空乐队）。
  { id: 'millsage', name: 'millsage', color: '#AA22EE' },
  // 一家Dumb Rock!（读作「一家団欒」）：乐队色取萌娘百科词条。
  { id: 'ikka-dumb-rock', name: '一家Dumb Rock!', color: '#FFAA33' },
  // 孤独摇滚！：结束乐队（結束バンド），乐队色取波奇粉。
  { id: 'kessoku-band', name: '结束乐队', color: '#F5A9C0', ip: 'bocchi-the-rock' },
];

export const BAND_BY_ID: ReadonlyMap<BandId, BandData> = new Map(BANDS.map(b => [b.id, b]));

/** The work a roster member is from: her primary band's, or her own `ip` when she has no band. */
export function ipOf(c: { bands?: BandId[]; ip?: IpId }): IpId {
  const band = c.bands?.[0];
  return (band ? BAND_BY_ID.get(band)?.ip : c.ip) ?? 'bang-dream';
}

/** Select-screen group key: the primary band, or the bandless group of her own work. The bandless
 *  (薇欧拉) close their own work's run instead of collecting at the very end of the roster. */
export function groupOf(c: { bands?: BandId[]; ip?: IpId }): string {
  return c.bands?.[0] ?? 'none:' + ipOf(c);
}

/** Every group key in display order: work by work, each work's bands and then its bandless. */
export function groupOrder(): string[] {
  const out: string[] = [];
  for (const ip of IPS) {
    for (const b of BANDS) if ((b.ip ?? 'bang-dream') === ip) out.push(b.id);
    out.push('none:' + ip);
  }
  return out;
}
