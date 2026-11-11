import { render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import { ProgressBar } from './ProgressBar'

test('expõe progressbar com min 0, max, now e valuetext', () => {
  render(<ProgressBar value={40} max={200} label="XP para o nível 3" valueText="40 de 200 XP" />)
  const bar = screen.getByRole('progressbar', { name: 'XP para o nível 3' })
  expect(bar).toHaveAttribute('aria-valuemin', '0')
  expect(bar).toHaveAttribute('aria-valuemax', '200')
  expect(bar).toHaveAttribute('aria-valuenow', '40')
  expect(bar).toHaveAttribute('aria-valuetext', '40 de 200 XP')
  expect(bar.firstElementChild).toHaveStyle({ width: '20%' })
})

test.each([
  [-5, '0%', '0'],
  [0, '0%', '0'],
  [200, '100%', '200'],
  [350, '100%', '200'],
])('value %d → largura %s, now %s', (value, width, now) => {
  render(<ProgressBar value={value} max={200} label="XP" valueText="x" />)
  const bar = screen.getByRole('progressbar', { name: 'XP' })
  expect(bar).toHaveAttribute('aria-valuenow', now)
  expect(bar.firstElementChild).toHaveStyle({ width })
})

test('repassa data-testid', () => {
  render(<ProgressBar value={1} max={2} label="XP" valueText="x" data-testid="pb" />)
  expect(screen.getByTestId('pb')).toHaveAttribute('role', 'progressbar')
})

test.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
  'max %d é impossível e lança RangeError',
  (max) => {
    expect(() => render(<ProgressBar value={1} max={max} label="x" valueText="x" />)).toThrow(
      RangeError,
    )
  },
)

test('value NaN é impossível e lança RangeError', () => {
  expect(() => render(<ProgressBar value={Number.NaN} max={10} label="x" valueText="x" />)).toThrow(
    RangeError,
  )
})
