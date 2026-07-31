import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'shortText'
})
export class ShortTextPipe implements PipeTransform {

  transform(value: string, length: number = 10): string {
    if (value?.length <= length) {
      return value
    }
    return value ? value?.slice(0, length) + '...' : ''
  }

}
