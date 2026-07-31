import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'mask',
  standalone: true,
})
export class MaskPipe implements PipeTransform {
  transform(value: string, pattern: string): string {
    if (!value) return '';

    // Convertir el valor a string
    const strValue = value.toString();

    // Aplicar el patrón de enmascarado
    let result = '';
    let valueIndex = 0;

    for (let i = 0; i < pattern.length && valueIndex < strValue.length; i++) {
      if (pattern[i] === '0') {
        result += strValue[valueIndex];
        valueIndex++;
      } else {
        result += pattern[i];
      }
    }

    return result;
  }
}
