export function validPdfHeader(bytes) {
  return bytes.length >= 5 && [37, 80, 68, 70, 45].every((value, index) => bytes[index] === value);
}
