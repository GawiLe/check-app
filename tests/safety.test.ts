import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync, lstatSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { strToU8, zipSync } from 'fflate'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ensureDirInside, inside, writeInside } from '../src/main/paths'
import { parseDelimited, parseXlsx, tableToVariants, toCsv } from '../src/shared/sheet'

describe('bestanden alleen binnen het project', () => {
  let root: string
  let proj: string
  let outside: string
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'bnnr-safe-'))
    proj = join(root, 'project')
    outside = join(root, 'buiten')
    mkdirSync(join(proj, 'assets'), { recursive: true })
    mkdirSync(outside)
  })
  afterEach(() => rmSync(root, { recursive: true, force: true }))

  it('weigert .., absolute paden en de projectmap zelf', () => {
    expect(() => inside(proj, '../buiten/x')).toThrow()
    expect(() => inside(proj, join(outside, 'x'))).toThrow()
    expect(() => inside(proj, '')).toThrow()
    expect(inside(proj, 'assets/nieuw.png')).toBe(join(proj, 'assets', 'nieuw.png'))
  })

  it('weigert een symlink naar buiten, ook een kapotte', () => {
    writeFileSync(join(outside, 'geheim.txt'), 'x')
    symlinkSync(join(outside, 'geheim.txt'), join(proj, 'assets', 'link.png'))
    symlinkSync(join(outside, 'bestaat-niet'), join(proj, 'assets', 'kapot.png'))
    symlinkSync(outside, join(proj, 'fonts'))
    expect(() => inside(proj, 'assets/link.png')).toThrow()
    expect(() => inside(proj, 'assets/kapot.png')).toThrow()
    expect(() => inside(proj, 'fonts/nieuw.woff2')).toThrow()
  })

  it('schrijven volgt nooit een symlink en laat geen tijdelijk bestand achter', async () => {
    symlinkSync(outside, join(proj, '.bnnr'))
    await expect(writeInside(proj, '.bnnr/autosave.bsproj', '{}')).rejects.toThrow()
    expect(existsSync(join(outside, 'autosave.bsproj'))).toBe(false)
    await writeInside(proj, 'project.bsproj', '{"a":1}')
    await writeInside(proj, 'project.bsproj', '{"a":2}')
    expect(readFileSync(join(proj, 'project.bsproj'), 'utf8')).toBe('{"a":2}')
    await writeInside(proj, 'versies/diep/v1.bsproj', 'v')
    expect(lstatSync(join(proj, 'versies', 'diep')).isDirectory()).toBe(true)
  })

  it('maakt geen map via een symlink-tussenmap', async () => {
    symlinkSync(outside, join(proj, 'assets', 'sub'))
    await expect(ensureDirInside(proj, 'assets/sub/dieper')).rejects.toThrow()
    expect(existsSync(join(outside, 'dieper'))).toBe(false)
  })
})

describe('spreadsheets veilig inlezen', () => {
  it('formules krijgen een apostrof in de CSV en verliezen die weer bij inlezen', () => {
    const csv = toCsv([
      ['Variant', 'Kop'],
      ['A', '=HYPERLINK("http://x")'],
      ['B', '-50% korting'],
      ['C', '+31 6 1234']
    ])
    expect(csv).toContain(`"'=HYPERLINK(""http://x"")"`)
    expect(csv).toContain(';-50% korting')
    expect(csv).toContain(';+31 6 1234')
    const fields = [{ key: 'k', label: 'Kop', kind: 'text' as const }]
    const res = tableToVariants(parseDelimited(csv), fields as never, [], {}, () => 'id')
    expect(res.variants.map((v) => v.values.k)).toEqual(['=HYPERLINK("http://x")', '-50% korting', '+31 6 1234'])
  })

  it('Excel: kolommen buiten het blad en vreemde relatie-id’s breken niets', () => {
    const xlsx = zipSync({
      'xl/workbook.xml': strToU8('<workbook><sheets><sheet name="a" r:id="rId(1"/></sheets></workbook>'),
      'xl/_rels/workbook.xml.rels': strToU8('<Relationships/>'),
      'xl/worksheets/sheet1.xml': strToU8(
        '<worksheet><sheetData><row><c r="A1" t="inlineStr"><is><t>Variant</t></is></c><c r="ZZZZZZ1" t="inlineStr"><is><t>x</t></is></c></row></sheetData></worksheet>'
      ),
      'xl/media/groot.bin': new Uint8Array(10)
    })
    const t = parseXlsx(xlsx)
    expect(t).toEqual([['Variant']])
  })
})
