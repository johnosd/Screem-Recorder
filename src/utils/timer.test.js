// src/utils/timer.test.js
import { fmt } from './timer.js'

test('formata 90 segundos corretamente', () => {
  expect(fmt(90000)).toBe('01:30')
})

test('formata zero', () => {
  expect(fmt(0)).toBe('00:00')
})

test('formata 1 hora', () => {
  expect(fmt(3600000)).toBe('60:00')
})
