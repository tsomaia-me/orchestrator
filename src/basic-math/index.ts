/**
 * Basic arithmetic operations.
 * @module basic-math
 */

/**
 * Adds two numbers.
 * @param a - First operand
 * @param b - Second operand
 * @returns The sum of a and b
 */
export function add(a: number, b: number): number {
  return a + b;
}

/**
 * Subtracts the second number from the first.
 * @param a - Minuend
 * @param b - Subtrahend
 * @returns The difference a - b
 */
export function subtract(a: number, b: number): number {
  return a - b;
}

/**
 * Multiplies two numbers.
 * @param a - First factor
 * @param b - Second factor
 * @returns The product of a and b
 */
export function multiply(a: number, b: number): number {
  return a * b;
}

/**
 * Divides the first number by the second.
 * @param a - Dividend
 * @param b - Divisor
 * @returns The quotient a / b
 * @throws Error when divisor is zero
 */
export function divide(a: number, b: number): number {
  if (b === 0) {
    throw new Error('Cannot divide by zero');
  }
  return a / b;
}
