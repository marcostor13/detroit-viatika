import {
  Directive,
  ElementRef,
  EventEmitter,
  Input,
  AfterViewInit,
  Output,
  OnDestroy,
  NgZone,
  inject,
} from '@angular/core';
import { ControlContainer } from '@angular/forms';
import { Subscription } from 'rxjs';
import { GoogleMapsLoaderService } from '../services/google-maps-loader.service';

export interface PlaceResult {
  address: string;
  lat: number;
  lng: number;
  departamento?: string;
  provincia?: string;
  distrito?: string;
  formattedAddress?: string;
}

declare const google: any;

@Directive({
  selector: '[appPlacesAutocomplete]',
  standalone: true,
})
export class PlacesAutocompleteDirective implements AfterViewInit, OnDestroy {
  @Input() country = 'pe';
  @Output() placeSelected = new EventEmitter<PlaceResult>();

  private el = inject(ElementRef);
  private mapsLoader = inject(GoogleMapsLoaderService);
  private ngZone = inject(NgZone);
  private controlContainer = inject(ControlContainer, { optional: true });

  private pacElement: HTMLElement | null = null;
  private ctrlSub: Subscription | null = null;

  ngAfterViewInit() {
    this.mapsLoader.load().then(() => {
      this.initNew();
    });
  }

  ngOnDestroy() {
    this.ctrlSub?.unsubscribe();
    this.pacElement?.remove();
  }

  // ─── New API (PlaceAutocompleteElement) ─────────────────────────────────

  private initNew() {
    const input = this.el.nativeElement as HTMLInputElement;

    const pac = new (google.maps.places as any).PlaceAutocompleteElement({
      includedRegionCodes: [this.country],
      includedPrimaryTypes: ['geocode', 'establishment'],
    }) as HTMLElement;

    this.pacElement = pac;

    // Forward placeholder from original input
    const placeholder = input.getAttribute('placeholder');
    if (placeholder) pac.setAttribute('placeholder', placeholder);

    // Border and theming on the host element — reliable regardless of shadow DOM.
    // color-scheme:only light prevents dark mode from affecting the shadow DOM.
    pac.style.cssText = [
      'display:block',
      'width:100%',
      'color-scheme:only light',
      'border:1px solid rgb(209 213 219)',
      'border-radius:0.75rem',
      'background-color:#ffffff',
      '--gmp-color-surface:#ffffff',
      '--gmp-color-on-surface:rgb(17 24 39)',
      '--gmp-color-outline:transparent',
      '--gmp-color-primary:var(--tema-primary,#D31212)',
    ].join(';');

    // Insert PAC before the hidden original input; keep input in DOM for Angular form
    input.insertAdjacentElement('beforebegin', pac);
    input.style.cssText = 'position:absolute;width:1px;height:1px;opacity:0;pointer-events:none;';

    // Sync typed text to the form control so validation works without selecting from dropdown
    pac.addEventListener('input', (e: Event) => {
      const target = e.composedPath()[0] as HTMLInputElement;
      const val = target?.value ?? '';
      this.ngZone.run(() => {
        input.value = val;
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });
    });

    // La API actual de Places emite `gmp-select` con un PlacePrediction en el
    // evento; las builds preview antiguas usaban `gmp-placeselect` con
    // `detail.place`. Soportamos ambas formas para ser robustos a la versión.
    pac.addEventListener('gmp-select', async (event: any) => {
      const prediction = event.placePrediction ?? event.detail?.placePrediction;
      const place = prediction?.toPlace
        ? prediction.toPlace()
        : (event.place ?? event.detail?.place);
      if (!place) return;

      await place.fetchFields({
        fields: ['displayName', 'formattedAddress', 'location', 'addressComponents'],
      });

      const result = this.buildNewResult(place);

      // Run inside Angular zone so patchValue triggers change detection
      this.ngZone.run(() => {
        input.value = result.address;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        this.placeSelected.emit(result);
      });
    });

    this.watchFormControl(pac, input);
  }

  private buildNewResult(place: any): PlaceResult {
    const components: any[] = place.addressComponents ?? [];
    // Handle both new API format (longText) and legacy format (long_name)
    const get = (type: string) => {
      const comp = components.find((c: any) => c.types?.includes(type));
      return ((comp?.longText ?? comp?.long_name) as string) ?? '';
    };

    let rawDep = get('administrative_area_level_1');
    const rawProv = get('administrative_area_level_2');
    const locality = get('locality');
    const sublocality = get('sublocality_level_1') || get('sublocality');
    const adminL3 = get('administrative_area_level_3');
    const neighborhood = get('neighborhood');

    // For establishments/POIs, administrative_area_level_1 is often absent — fall back to locality
    if (!rawDep) rawDep = locality;

    const specificDistrict = sublocality || neighborhood || adminL3;
    const cleanedDep = this.cleanName(rawDep);
    const cleanedProv = this.cleanName(rawProv);
    const useLocality = locality && locality !== cleanedDep && locality !== cleanedProv;
    const cleanedDistrito = this.cleanName(specificDistrict || (useLocality ? locality : ''));
    const suffix = cleanedDistrito || cleanedProv || cleanedDep;

    const displayName: string = place.displayName ?? '';
    const formattedAddress: string = place.formattedAddress ?? '';
    const address = this.buildAddress(
      { name: displayName, formatted_address: formattedAddress, types: place.types ?? [] },
      suffix
    );

    return {
      address,
      lat: (place.location?.lat() as number) ?? 0,
      lng: (place.location?.lng() as number) ?? 0,
      departamento: cleanedDep,
      provincia: cleanedProv,
      distrito: cleanedDistrito,
      formattedAddress,
    };
  }

  // Sync Angular form control value changes back to the PAC element (e.g. edit mode)
  private watchFormControl(pac: HTMLElement, input: HTMLInputElement) {
    const name =
      input.getAttribute('formcontrolname') ?? input.getAttribute('ng-reflect-name');

    if (!name || !this.controlContainer?.control) return;

    const ctrl = this.controlContainer.control.get(name);
    if (!ctrl) return;

    // Set initial value after view is settled
    setTimeout(() => {
      if (ctrl.value) this.setPacValue(pac, ctrl.value);
    }, 0);

    this.ctrlSub = ctrl.valueChanges.subscribe((val: string | null) => {
      if (val != null) this.setPacValue(pac, val);
    });
  }

  private setPacValue(pac: HTMLElement, value: string, attempts = 0) {
    // PlaceAutocompleteElement may use shadow DOM or open DOM depending on browser/version
    const shadow = (pac as any).shadowRoot;
    const inner: HTMLInputElement | null =
      shadow?.querySelector('input') ?? pac.querySelector('input');
    if (inner) {
      inner.value = value;
    } else if (attempts < 20) {
      // El input interno del web component puede no haberse renderizado todavía
      // (p. ej. al precargar el formulario en modo edición). Reintentar brevemente.
      setTimeout(() => this.setPacValue(pac, value, attempts + 1), 50);
    }
  }

  // ─── Legacy API (Autocomplete) ──────────────────────────────────────────

  private initLegacy() {
    const input = this.el.nativeElement as HTMLInputElement;
    let sessionToken = new google.maps.places.AutocompleteSessionToken();

    const autocomplete = new google.maps.places.Autocomplete(input, {
      types: ['geocode', 'establishment'],
      componentRestrictions: { country: this.country },
      fields: ['name', 'formatted_address', 'geometry', 'address_components', 'types'],
      sessionToken,
    });

    autocomplete.addListener('place_changed', () => {
      const place = autocomplete.getPlace();
      if (!place?.geometry?.location) return;

      const components: any[] = place.address_components ?? [];
      const get = (type: string) =>
        (components.find((c: any) => c.types.includes(type))?.long_name as string) ?? '';

      const rawDep = get('administrative_area_level_1');
      const rawProv = get('administrative_area_level_2');
      const locality = get('locality');
      const sublocality = get('sublocality_level_1') || get('sublocality');
      const adminL3 = get('administrative_area_level_3');
      const neighborhood = get('neighborhood');

      const specificDistrict = sublocality || neighborhood || adminL3;
      const cleanedDep = this.cleanName(rawDep);
      const cleanedProv = this.cleanName(rawProv);
      const useLocality = locality && locality !== cleanedDep && locality !== cleanedProv;
      const cleanedDistrito = this.cleanName(specificDistrict || (useLocality ? locality : ''));
      const suffix = cleanedDistrito || cleanedProv || cleanedDep;

      const address = this.buildAddress(place, suffix);
      (input as HTMLInputElement).value = address;

      this.placeSelected.emit({
        address,
        lat: place.geometry.location.lat() as number,
        lng: place.geometry.location.lng() as number,
        departamento: cleanedDep,
        provincia: cleanedProv,
        distrito: cleanedDistrito,
      });

      sessionToken = new google.maps.places.AutocompleteSessionToken();
    });
  }

  // ─── Shared helpers ──────────────────────────────────────────────────────

  private cleanName(raw: string): string {
    if (!raw) return '';
    return raw
      .replace(
        /^(Gobierno Regional de|Región|Region|Departamento de|Provincia de|Provincia Constitucional del?)\s*/i,
        ''
      )
      .trim();
  }

  private buildAddress(
    place: { name?: string; formatted_address?: string; types?: string[] },
    suffix: string
  ): string {
    const name = (place.name ?? '').trim();
    const formatted = (place.formatted_address ?? '').trim();
    const types = place.types ?? [];
    const isEstablishment = types.some((t) =>
      ['establishment', 'point_of_interest', 'premise', 'subpremise'].includes(t)
    );

    if (name && (isEstablishment || (formatted && !formatted.startsWith(name)))) {
      if (suffix && !name.toLowerCase().includes(suffix.toLowerCase())) {
        return `${name}, ${suffix}`;
      }
      return name;
    }

    return (
      formatted ||
      name ||
      (this.el.nativeElement as HTMLInputElement).value
    );
  }
}
