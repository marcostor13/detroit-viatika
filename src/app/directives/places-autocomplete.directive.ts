import { Directive, ElementRef, EventEmitter, Input, AfterViewInit, Output, inject } from '@angular/core';
import { GoogleMapsLoaderService } from '../services/google-maps-loader.service';

export interface PlaceResult {
  address: string;
  lat: number;
  lng: number;
  departamento?: string;
  provincia?: string;
  distrito?: string;
}

declare const google: any;

@Directive({
  selector: '[appPlacesAutocomplete]',
  standalone: true,
})
export class PlacesAutocompleteDirective implements AfterViewInit {
  @Input() country = 'pe';
  @Output() placeSelected = new EventEmitter<PlaceResult>();

  private el = inject(ElementRef);
  private mapsLoader = inject(GoogleMapsLoaderService);

  ngAfterViewInit() {
    this.mapsLoader.load().then(() => this.initAutocomplete());
  }

  private cleanLocationName(raw: string): string {
    if (!raw) return '';
    return raw
      .replace(/^(Gobierno Regional de|Región|Region|Departamento de|Provincia de|Provincia Constitucional del?)\s*/i, '')
      .trim();
  }

  /** Nombre legible: establecimientos por `name`, ciudades/direcciones por `formatted_address`. */
  private buildDisplayAddress(
    place: { name?: string; formatted_address?: string; types?: string[] },
    locationSuffix: string
  ): string {
    const name = (place.name || '').trim();
    const formatted = (place.formatted_address || '').trim();
    const types = place.types || [];
    const isEstablishment = types.some((t) =>
      ['establishment', 'point_of_interest', 'premise', 'subpremise'].includes(t)
    );

    if (name && (isEstablishment || (formatted && !formatted.startsWith(name)))) {
      if (locationSuffix && !name.toLowerCase().includes(locationSuffix.toLowerCase())) {
        return `${name}, ${locationSuffix}`;
      }
      return name;
    }

    return formatted || name || (this.el.nativeElement as HTMLInputElement).value;
  }

  private initAutocomplete() {
    // Session token: agrupa todos los keystrokes + la selección final en
    // 1 sola unidad facturable (~$0.017) en lugar de cobrar por keystroke.
    let sessionToken = new google.maps.places.AutocompleteSessionToken();

    const autocomplete = new google.maps.places.Autocomplete(
      this.el.nativeElement,
      {
        types: ['geocode', 'establishment'],
        componentRestrictions: { country: this.country },
        fields: ['name', 'formatted_address', 'geometry', 'address_components', 'types'],
        sessionToken,
      }
    );

    autocomplete.addListener('place_changed', () => {
      const place = autocomplete.getPlace();
      if (place?.geometry?.location) {
        const components: any[] = place.address_components || [];
        const getComponent = (type: string) =>
          components.find((c: any) => c.types.includes(type))?.long_name || '';

        const rawDep = getComponent('administrative_area_level_1');
        const rawProv = getComponent('administrative_area_level_2');
        const locality = getComponent('locality');
        const sublocality = getComponent('sublocality_level_1') || getComponent('sublocality');
        const adminL3 = getComponent('administrative_area_level_3');
        const neighborhood = getComponent('neighborhood');

        const specificDistrict = sublocality || neighborhood || adminL3;
        const cleanedDep = this.cleanLocationName(rawDep);
        const cleanedProv = this.cleanLocationName(rawProv);
        const useLocality = locality && locality !== cleanedDep && locality !== cleanedProv;
        const distrito = specificDistrict || (useLocality ? locality : '');
        const cleanedDistrito = this.cleanLocationName(distrito);
        const locationSuffix = cleanedDistrito || cleanedProv || cleanedDep;
        const address = this.buildDisplayAddress(place, locationSuffix);

        // Google suele reemplazar el input por la localidad (ej. "Ventanilla"); forzamos el nombre elegido.
        (this.el.nativeElement as HTMLInputElement).value = address;

        this.placeSelected.emit({
          address,
          lat: place.geometry.location.lat(),
          lng: place.geometry.location.lng(),
          departamento: cleanedDep,
          provincia: cleanedProv,
          distrito: cleanedDistrito,
        });
      }
      sessionToken = new google.maps.places.AutocompleteSessionToken();
    });
  }
}
