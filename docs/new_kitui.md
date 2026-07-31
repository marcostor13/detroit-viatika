markdown_content = """# 🎨 UI/UX Kit: TEMA - Seguridad y Medio Ambiente

Este documento técnico define la identidad visual y los componentes de interfaz para la marca **TEMA**, basados en el análisis cromático y tipográfico de su identidad corporativa.

---

## 1. Fundamentos de Marca (Brand Foundation)

### 1.1 Paleta de Colores (Color Palette)

Los colores han sido extraídos para garantizar contraste y cumplimiento de accesibilidad (WCAG).

| Categoría | Color | Hex | Uso Sugerido |
| :--- | :--- | :--- | :--- |
| **Primario (Rojo)** | ![#D31212](https://via.placeholder.com/15/D31212?text=+) `#D31212` | CTAs principales, estados activos, iconos de alerta. |
| **Acento (Granate)** | ![#9B1B22](https://via.placeholder.com/15/9B1B22?text=+) `#9B1B22` | Headers, hovers en botones primarios, bordes de énfasis. |
| **Texto (Gris Oscuro)** | ![#4F4F4F](https://via.placeholder.com/15/4F4F4F?text=+) `#4F4F4F` | Títulos (H1-H3), etiquetas de formularios, texto de logo. |
| **Cuerpo (Gris Medio)** | ![#6B6B6B](https://via.placeholder.com/15/6B6B6B?text=+) `#6B6B6B` | Texto de párrafo, descripciones, subtítulos secundarios. |
| **Fondo (Gris Neutro)** | ![#F5F7FA](https://via.placeholder.com/15/F5F7FA?text=+) `#F5F7FA` | Fondos de sección, layouts de dashboard. |
| **Bordes (Gris Claro)** | ![#E0E0E0](https://via.placeholder.com/15/E0E0E0?text=+) `#E0E0E0` | Divisores, bordes de inputs, tablas. |

---

## 2. Tipografía (Typography)

Se recomienda una escala tipográfica que combine la robustez industrial con la legibilidad moderna.

* **Principal (Headings):** `Zilla Slab` o `Roboto Slab`.
    * *Uso:* Títulos de sección y elementos que requieran autoridad.
* **Secundaria (Interface/Body):** `Inter` o `Roboto`.
    * *Uso:* Texto de lectura, formularios y navegación.

### Jerarquía Visual
* **H1:** 32pt / Bold / `#4F4F4F`
* **H2:** 24pt / Semi-Bold / `#4F4F4F`
* **H3:** 18pt / Medium / `#4F4F4F`
* **Body:** 16pt / Regular / `#6B6B6B`
* **Small:** 12pt / Regular / `#6B6B6B`

---

## 3. Componentes de Interfaz (UI Components)

### 3.1 Botones
* **Primary:** Fondo `#D31212`, Texto `#FFFFFF`, Radio `4px`.
* **Secondary:** Fondo `#4F4F4F`, Texto `#FFFFFF`.
* **Ghost/Outline:** Borde `#D31212`, Texto `#D31212`, Fondo transparente.

### 3.2 Inputs y Formularios
* **Default:** Borde `#E0E0E0`, Fondo `#FFFFFF`.
* **Focus:** Borde `#D31212`, Glow `#D31212` (20% opacidad).
* **Error:** Borde `#9B1B22`, Icono de advertencia integrado.

### 3.3 Cards (Tarjetas de Datos)
* **Estilo:** Borde sólido de `1px` en `#E0E0E0` o sombra suave.
* **Acento:** Línea superior de `3px` con color Granate (`#9B1B22`) para indicar áreas de "Seguridad".

---

## 4. Implementación Técnica (CSS Variables)

```css
:root {
  /* Brand */
  --tema-primary: #D31212;
  --tema-accent: #9B1B22;
  
  /* Text & Surface */
  --tema-text-main: #4F4F4F;
  --tema-text-body: #6B6B6B;
  --tema-bg-surface: #F5F7FA;
  --tema-white: #FFFFFF;
  --tema-border: #E0E0E0;

  /* Fonts */
  --font-header: 'Zilla Slab', serif;
  --font-body: 'Inter', sans-serif;
  
  /* Effects */
  --radius-standard: 4px;
  --shadow-sm: 0 2px 4px rgba(0,0,0,0.05);
}