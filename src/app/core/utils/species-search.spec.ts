import { TAXONOMY } from '../../../testing/fixtures';
import { buildSpeciesIndex, filterSpecies, normalizeSearchText } from './species-search';

describe('species search', () => {
  const index = buildSpeciesIndex(TAXONOMY);
  const codes = (q: string) => filterSpecies(index, q).map((s) => s.speciesCode);

  it('keeps Hebrew letters, drops niqqud and maps final letters', () => {
    expect(normalizeSearchText('דְּרוֹר הַבַּיִת')).toBe('דרור הבית');
    expect(normalizeSearchText('שלדג, גמדי!')).toBe('שלדג גמדי');
    expect(normalizeSearchText('ערבים')).toBe('ערבימ');
  });

  it('finds species by Hebrew name, full or half-typed', () => {
    expect(codes('דרור הבית')).toEqual(['houspa']);
    expect(codes('שלד')).toEqual(['comkin1']);
    expect(codes('גמדי')).toEqual(['comkin1']);
  });

  it('still finds species by English and scientific name', () => {
    expect(codes('house sp')).toEqual(['houspa']);
    expect(codes('passer')).toEqual(['houspa', 'spaspa1']);
  });
});
