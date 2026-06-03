export interface Distrito {
  label: string;
}

export interface Provincia {
  label: string;
  distritos: Distrito[];
}

export interface Departamento {
  label: string;
  provincias: Provincia[];
}

export const PERU_LOCATIONS: Departamento[] = [
  {
    label: 'Amazonas',
    provincias: [
      { label: 'Chachapoyas', distritos: [{ label: 'Chachapoyas' }, { label: 'Asunción' }, { label: 'Balsas' }, { label: 'Cheto' }, { label: 'Chiliquín' }, { label: 'Chuquibamba' }, { label: 'Granada' }, { label: 'Huancas' }, { label: 'La Jalca' }, { label: 'Leimebamba' }, { label: 'Levanto' }, { label: 'Magdalena' }, { label: 'Mariscal Castilla' }, { label: 'Molinopampa' }, { label: 'Montevideo' }, { label: 'Olleros' }, { label: 'Quinjalca' }, { label: 'San Francisco de Daguas' }, { label: 'San Isidro de Maino' }, { label: 'Soloco' }, { label: 'Sonche' }] },
      { label: 'Bagua', distritos: [{ label: 'Bagua' }, { label: 'Aramango' }, { label: 'Copallín' }, { label: 'El Parco' }, { label: 'Imaza' }, { label: 'La Peca' }] },
      { label: 'Bongará', distritos: [{ label: 'Jumbilla' }, { label: 'Chisquilla' }, { label: 'Churuja' }, { label: 'Corosha' }, { label: 'Cuispes' }, { label: 'Florida' }, { label: 'Jazan' }, { label: 'Recta' }, { label: 'San Carlos' }, { label: 'Shipasbamba' }, { label: 'Valera' }, { label: 'Yambrasbamba' }] },
      { label: 'Condorcanqui', distritos: [{ label: 'Nieva' }, { label: 'El Cenepa' }, { label: 'Río Santiago' }] },
      { label: 'Luya', distritos: [{ label: 'Lamud' }, { label: 'Camporredondo' }, { label: 'Cocabamba' }, { label: 'Colcamar' }, { label: 'Conila' }, { label: 'Inguilpata' }, { label: 'Longuita' }, { label: 'Lonya Chico' }, { label: 'Luya' }, { label: 'Luya Viejo' }, { label: 'María' }, { label: 'Ocalli' }, { label: 'Ocumal' }, { label: 'Pisuquía' }, { label: 'Providencia' }, { label: 'San Cristóbal' }, { label: 'San Francisco del Yeso' }, { label: 'San Jerónimo' }, { label: 'San Juan de Lopecancha' }, { label: 'Santa Catalina' }, { label: 'Santo Tomás' }, { label: 'Tingo' }, { label: 'Trita' }] },
      { label: 'Rodríguez de Mendoza', distritos: [{ label: 'San Nicolás' }, { label: 'Chirimoto' }, { label: 'Cochamal' }, { label: 'Huambo' }, { label: 'Limabamba' }, { label: 'Longar' }, { label: 'Mariscal Benavides' }, { label: 'Milpuc' }, { label: 'Omia' }, { label: 'Santa Rosa' }, { label: 'Totora' }, { label: 'Vista Alegre' }] },
      { label: 'Utcubamba', distritos: [{ label: 'Bagua Grande' }, { label: 'Cajaruro' }, { label: 'Cumba' }, { label: 'El Milagro' }, { label: 'Jamalca' }, { label: 'Lonya Grande' }, { label: 'Yamon' }] },
    ],
  },
  {
    label: 'Áncash',
    provincias: [
      { label: 'Huaraz', distritos: [{ label: 'Huaraz' }, { label: 'Cochabamba' }, { label: 'Colcabamba' }, { label: 'Huanchay' }, { label: 'Independencia' }, { label: 'Jangas' }, { label: 'La Libertad' }, { label: 'Olleros' }, { label: 'Pampas Grande' }, { label: 'Pariacoto' }, { label: 'Pira' }, { label: 'Tarica' }] },
      { label: 'Aija', distritos: [{ label: 'Aija' }, { label: 'Coris' }, { label: 'Huacllán' }, { label: 'La Merced' }, { label: 'Succha' }] },
      { label: 'Antonio Raymondi', distritos: [{ label: 'Llamellín' }, { label: 'Aczo' }, { label: 'Chaccho' }, { label: 'Chingas' }, { label: 'Mirgas' }, { label: 'San Juan de Rontoy' }] },
      { label: 'Asunción', distritos: [{ label: 'Chacas' }, { label: 'Acochaca' }] },
      { label: 'Bolognesi', distritos: [{ label: 'Chiquián' }, { label: 'Abelardo Pardo Lezameta' }, { label: 'Antonio Raymondi' }, { label: 'Aquia' }, { label: 'Cajacay' }, { label: 'Canis' }, { label: 'Colquioc' }, { label: 'Huallanca' }, { label: 'Huasta' }, { label: 'Huayllacayán' }, { label: 'La Primavera' }, { label: 'Mangas' }, { label: 'Pacllón' }, { label: 'San Miguel de Corpanqui' }, { label: 'Ticllos' }] },
      { label: 'Carhuaz', distritos: [{ label: 'Carhuaz' }, { label: 'Acopampa' }, { label: 'Amashca' }, { label: 'Anta' }, { label: 'Ataquero' }, { label: 'Marcará' }, { label: 'Pariahuanca' }, { label: 'San Miguel de Aco' }, { label: 'Shilla' }, { label: 'Tinco' }, { label: 'Yungar' }] },
      { label: 'Carlos Fermín Fitzcarrald', distritos: [{ label: 'San Luis' }, { label: 'San Nicolás' }, { label: 'Yauya' }] },
      { label: 'Casma', distritos: [{ label: 'Casma' }, { label: 'Buena Vista Alta' }, { label: 'Comandante Noel' }, { label: 'Yaután' }] },
      { label: 'Corongo', distritos: [{ label: 'Corongo' }, { label: 'Aco' }, { label: 'Bambas' }, { label: 'Cusca' }, { label: 'La Pampa' }, { label: 'Yanac' }, { label: 'Yupán' }] },
      { label: 'Huari', distritos: [{ label: 'Huari' }, { label: 'Anra' }, { label: 'Cajay' }, { label: 'Chavín de Huántar' }, { label: 'Huacachi' }, { label: 'Huacchis' }, { label: 'Huachis' }, { label: 'Huantar' }, { label: 'Masin' }, { label: 'Paucas' }, { label: 'Pontó' }, { label: 'Rahuapampa' }, { label: 'Rapayán' }, { label: 'San Marcos' }, { label: 'San Pedro de Chaná' }, { label: 'Uco' }] },
      { label: 'Huarmey', distritos: [{ label: 'Huarmey' }, { label: 'Cochapetí' }, { label: 'Culebras' }, { label: 'Huayán' }, { label: 'Malvas' }] },
      { label: 'Huaylas', distritos: [{ label: 'Caraz' }, { label: 'Huallanca' }, { label: 'Huata' }, { label: 'Huaylas' }, { label: 'Mato' }, { label: 'Pamparomás' }, { label: 'Pueblo Libre' }, { label: 'Santa Cruz' }, { label: 'Santo Toribio' }, { label: 'Yuracmarca' }] },
      { label: 'Mariscal Luzuriaga', distritos: [{ label: 'Piscobamba' }, { label: 'Casca' }, { label: 'Eleazar Guzmán Barrón' }, { label: 'Fidel Olivas Escudero' }, { label: 'Llama' }, { label: 'Llumpa' }, { label: 'Lucma' }, { label: 'Musga' }] },
      { label: 'Ocros', distritos: [{ label: 'Ocros' }, { label: 'Acas' }, { label: 'Cajamarquilla' }, { label: 'Carhuapampa' }, { label: 'Cochas' }, { label: 'Congas' }, { label: 'Llipa' }, { label: 'San Cristóbal de Raján' }, { label: 'San Pedro' }, { label: 'Santiago de Chilcas' }] },
      { label: 'Pallasca', distritos: [{ label: 'Cabana' }, { label: 'Bolognesi' }, { label: 'Conchucos' }, { label: 'Huacaschuque' }, { label: 'Huandoval' }, { label: 'Lacabamba' }, { label: 'Llapo' }, { label: 'Pallasca' }, { label: 'Pampas' }, { label: 'Santa Rosa' }, { label: 'Tauca' }] },
      { label: 'Pomabamba', distritos: [{ label: 'Pomabamba' }, { label: 'Huayllán' }, { label: 'Parobamba' }, { label: 'Quinuabamba' }] },
      { label: 'Recuay', distritos: [{ label: 'Recuay' }, { label: 'Cátac' }, { label: 'Cotaparaco' }, { label: 'Huayllapampa' }, { label: 'Llaclín' }, { label: 'Marca' }, { label: 'Pampas Chico' }, { label: 'Pararin' }, { label: 'Tapacocha' }, { label: 'Ticapampa' }] },
      { label: 'Santa', distritos: [{ label: 'Chimbote' }, { label: 'Cáceres del Perú' }, { label: 'Coishco' }, { label: 'Macate' }, { label: 'Moro' }, { label: 'Nepeña' }, { label: 'Nuevo Chimbote' }, { label: 'Samanco' }, { label: 'Santa' }] },
      { label: 'Sihuas', distritos: [{ label: 'Sihuas' }, { label: 'Acobamba' }, { label: 'Alfonso Ugarte' }, { label: 'Cashapampa' }, { label: 'Chingalpo' }, { label: 'Huayllabamba' }, { label: 'Quiches' }, { label: 'Ragash' }, { label: 'San Juan' }, { label: 'Sicsibamba' }] },
      { label: 'Yungay', distritos: [{ label: 'Yungay' }, { label: 'Cascapara' }, { label: 'Mancos' }, { label: 'Matacoto' }, { label: 'Quillo' }, { label: 'Ranrahirca' }, { label: 'Shupluy' }, { label: 'Yanama' }] },
    ],
  },
  {
    label: 'Apurímac',
    provincias: [
      { label: 'Abancay', distritos: [{ label: 'Abancay' }, { label: 'Chacoche' }, { label: 'Circa' }, { label: 'Curahuasi' }, { label: 'Huanipaca' }, { label: 'Lambrama' }, { label: 'Pichirhua' }, { label: 'San Pedro de Cachora' }, { label: 'Tamburco' }] },
      { label: 'Andahuaylas', distritos: [{ label: 'Andahuaylas' }, { label: 'Andarapa' }, { label: 'Chiara' }, { label: 'Huancarama' }, { label: 'Huancaray' }, { label: 'Huayana' }, { label: 'Kishuará' }, { label: 'Pacobamba' }, { label: 'Pacucha' }, { label: 'Pampachiri' }, { label: 'Pomacocha' }, { label: 'San Antonio de Cachi' }, { label: 'San Jerónimo' }, { label: 'San Miguel de Chaccrampa' }, { label: 'Santa María de Chicmo' }, { label: 'Talavera' }, { label: 'Tumay Huaraca' }, { label: 'Turpo' }, { label: 'Kaquiabamba' }, { label: 'José María Arguedas' }] },
      { label: 'Antabamba', distritos: [{ label: 'Antabamba' }, { label: 'El Oro' }, { label: 'Huaquirca' }, { label: 'Juan Espinoza Medrano' }, { label: 'Oropesa' }, { label: 'Pachaconas' }, { label: 'Sabaino' }] },
      { label: 'Aymaraes', distritos: [{ label: 'Chalhuanca' }, { label: 'Capaya' }, { label: 'Caraybamba' }, { label: 'Chapimarca' }, { label: 'Colcabamba' }, { label: 'Cotaruse' }, { label: 'Ihuayllo' }, { label: 'Justo Apu Sahuaraura' }, { label: 'Lucre' }, { label: 'Pocohuanca' }, { label: 'San Juan de Chacña' }, { label: 'Sañayca' }, { label: 'Soraya' }, { label: 'Tapairihua' }, { label: 'Tintay' }, { label: 'Toraya' }, { label: 'Yanaca' }] },
      { label: 'Cotabambas', distritos: [{ label: 'Tambobamba' }, { label: 'Cotabambas' }, { label: 'Coyllurqui' }, { label: 'Haquira' }, { label: 'Mara' }, { label: 'Challhuahuacho' }] },
      { label: 'Chincheros', distritos: [{ label: 'Chincheros' }, { label: 'Anco Huallo' }, { label: 'Cocharcas' }, { label: 'Huaccana' }, { label: 'Ocobamba' }, { label: 'Ongoy' }, { label: 'Uranmarca' }, { label: 'Ranracancha' }] },
      { label: 'Grau', distritos: [{ label: 'Chuquibambilla' }, { label: 'Curpahuasi' }, { label: 'Gamarra' }, { label: 'Huayllati' }, { label: 'Mamara' }, { label: 'Micaela Bastidas' }, { label: 'Pataypampa' }, { label: 'Progreso' }, { label: 'San Antonio' }, { label: 'Santa Rosa' }, { label: 'Turpay' }, { label: 'Vilcabamba' }, { label: 'Virundo' }, { label: 'Curasco' }] },
    ],
  },
  {
    label: 'Arequipa',
    provincias: [
      { label: 'Arequipa', distritos: [{ label: 'Arequipa' }, { label: 'Alto Selva Alegre' }, { label: 'Cayma' }, { label: 'Cerro Colorado' }, { label: 'Characato' }, { label: 'Chiguata' }, { label: 'Jacobo Hunter' }, { label: 'José Luis Bustamante y Rivero' }, { label: 'La Joya' }, { label: 'Mariano Melgar' }, { label: 'Miraflores' }, { label: 'Mollebaya' }, { label: 'Paucarpata' }, { label: 'Pocsi' }, { label: 'Polobaya' }, { label: 'Quequeña' }, { label: 'Sabandía' }, { label: 'Sachaca' }, { label: 'San Juan de Siguas' }, { label: 'San Juan de Tarucani' }, { label: 'Santa Isabel de Siguas' }, { label: 'Santa Rita de Siguas' }, { label: 'Socabaya' }, { label: 'Tiabaya' }, { label: 'Uchumayo' }, { label: 'Vítor' }, { label: 'Yanahuara' }, { label: 'Yarabamba' }, { label: 'Yura' }] },
      { label: 'Camaná', distritos: [{ label: 'Camaná' }, { label: 'José María Quimper' }, { label: 'Mariano Nicolás Valcárcel' }, { label: 'Mariscal Cáceres' }, { label: 'Nicolás de Piérola' }, { label: 'Ocoña' }, { label: 'Quilca' }, { label: 'Samuel Pastor' }] },
      { label: 'Caravelí', distritos: [{ label: 'Caravelí' }, { label: 'Acarí' }, { label: 'Atico' }, { label: 'Atiquipa' }, { label: 'Bella Unión' }, { label: 'Cahuacho' }, { label: 'Chala' }, { label: 'Chaparra' }, { label: 'Huanuhuanu' }, { label: 'Jaqui' }, { label: 'Lomas' }, { label: 'Quicacha' }, { label: 'Yauca' }] },
      { label: 'Castilla', distritos: [{ label: 'Aplao' }, { label: 'Andagua' }, { label: 'Ayo' }, { label: 'Chachas' }, { label: 'Chilcaymarca' }, { label: 'Choco' }, { label: 'Huancarqui' }, { label: 'Machaguay' }, { label: 'Orcopampa' }, { label: 'Pampacolca' }, { label: 'Tipán' }, { label: 'Uñón' }, { label: 'Uraca' }, { label: 'Viraco' }] },
      { label: 'Caylloma', distritos: [{ label: 'Chivay' }, { label: 'Achoma' }, { label: 'Cabanaconde' }, { label: 'Callalli' }, { label: 'Coporaque' }, { label: 'Huambo' }, { label: 'Huanca' }, { label: 'Ichupampa' }, { label: 'Lari' }, { label: 'Lluta' }, { label: 'Maca' }, { label: 'Madrigal' }, { label: 'San Antonio de Chuca' }, { label: 'Sibayo' }, { label: 'Tapay' }, { label: 'Tisco' }, { label: 'Tuti' }, { label: 'Yanque' }, { label: 'Majes' }] },
      { label: 'Condesuyos', distritos: [{ label: 'Chuquibamba' }, { label: 'Andaray' }, { label: 'Cayarani' }, { label: 'Chichas' }, { label: 'Iray' }, { label: 'Río Grande' }, { label: 'Salamanca' }, { label: 'Yanaquihua' }] },
      { label: 'Islay', distritos: [{ label: 'Mollendo' }, { label: 'Cocachacra' }, { label: 'Dean Valdivia' }, { label: 'Islay' }, { label: 'Mejía' }, { label: 'Punta de Bombón' }] },
      { label: 'La Unión', distritos: [{ label: 'Cotahuasi' }, { label: 'Alca' }, { label: 'Charcana' }, { label: 'Huaynacotas' }, { label: 'Pampamarca' }, { label: 'Puyca' }, { label: 'Quechualla' }, { label: 'Sayla' }, { label: 'Tauria' }, { label: 'Tomepampa' }, { label: 'Toro' }] },
    ],
  },
  {
    label: 'Ayacucho',
    provincias: [
      { label: 'Huamanga', distritos: [{ label: 'Ayacucho' }, { label: 'Acocro' }, { label: 'Acos Vinchos' }, { label: 'Carmen Alto' }, { label: 'Chiara' }, { label: 'Jesús Nazareno' }, { label: 'Ocros' }, { label: 'Pacaycasa' }, { label: 'Quinua' }, { label: 'San José de Ticllas' }, { label: 'San Juan Bautista' }, { label: 'Santiago de Pischa' }, { label: 'Socos' }, { label: 'Tambillo' }, { label: 'Vinchos' }, { label: 'Andrés Avelino Cáceres Dorregaray' }] },
      { label: 'Cangallo', distritos: [{ label: 'Cangallo' }, { label: 'Chuschi' }, { label: 'Los Morochucos' }, { label: 'María Parado de Bellido' }, { label: 'Paras' }, { label: 'Totos' }] },
      { label: 'Huanca Sancos', distritos: [{ label: 'Sancos' }, { label: 'Carapo' }, { label: 'Sacsamarca' }, { label: 'Santiago de Lucanamarca' }] },
      { label: 'Huanta', distritos: [{ label: 'Huanta' }, { label: 'Ayahuanco' }, { label: 'Huamanguilla' }, { label: 'Iguaín' }, { label: 'Luricocha' }, { label: 'Santillana' }, { label: 'Sivia' }, { label: 'Llochegua' }, { label: 'Canayre' }, { label: 'Uchuraccay' }, { label: 'Pucacolpa' }, { label: 'Chaca' }] },
      { label: 'La Mar', distritos: [{ label: 'San Miguel' }, { label: 'Anco' }, { label: 'Ayna' }, { label: 'Chilcas' }, { label: 'Chungui' }, { label: 'Luis Carranza' }, { label: 'Santa Rosa' }, { label: 'Tambo' }, { label: 'Samugari' }, { label: 'Anchihuay' }, { label: 'Oronccoy' }] },
      { label: 'Lucanas', distritos: [{ label: 'Puquio' }, { label: 'Aucará' }, { label: 'Cabana' }, { label: 'Carmen Salcedo' }, { label: 'Chaviña' }, { label: 'Chipao' }, { label: 'Huac-Huas' }, { label: 'Laramate' }, { label: 'Leoncio Prado' }, { label: 'Llauta' }, { label: 'Lucanas' }, { label: 'Ocaña' }, { label: 'Otoca' }, { label: 'Saisa' }, { label: 'San Cristóbal' }, { label: 'San Juan' }, { label: 'San Pedro' }, { label: 'San Pedro de Palco' }, { label: 'Sancos' }, { label: 'Santa Ana de Huaycahuacho' }, { label: 'Santa Lucía' }] },
      { label: 'Parinacochas', distritos: [{ label: 'Coracora' }, { label: 'Chumpi' }, { label: 'Coronel Castañeda' }, { label: 'Pacapausa' }, { label: 'Pullo' }, { label: 'Puyusca' }, { label: 'San Francisco de Ravacayco' }, { label: 'Upahuacho' }] },
      { label: 'Páucar del Sara Sara', distritos: [{ label: 'Pausa' }, { label: 'Colta' }, { label: 'Corculla' }, { label: 'Lampa' }, { label: 'Marcabamba' }, { label: 'Oyolo' }, { label: 'Pararca' }, { label: 'San Javier de Alpabamba' }, { label: 'San José de Ushua' }, { label: 'Sara Sara' }] },
      { label: 'Sucre', distritos: [{ label: 'Querobamba' }, { label: 'Belén' }, { label: 'Chalcos' }, { label: 'Chilcayoc' }, { label: 'Huacaña' }, { label: 'Morcolla' }, { label: 'Paico' }, { label: 'San Pedro de Larcay' }, { label: 'San Salvador de Quije' }, { label: 'Santiago de Paucaray' }, { label: 'Soras' }] },
      { label: 'Víctor Fajardo', distritos: [{ label: 'Huancapi' }, { label: 'Alcamenca' }, { label: 'Apongo' }, { label: 'Asquipata' }, { label: 'Canaria' }, { label: 'Cayara' }, { label: 'Colca' }, { label: 'Huamanquiquia' }, { label: 'Huancaraylla' }, { label: 'Huaya' }, { label: 'Sarhua' }, { label: 'Vilcanchos' }] },
      { label: 'Vilcas Huamán', distritos: [{ label: 'Vilcas Huamán' }, { label: 'Accomarca' }, { label: 'Carhuanca' }, { label: 'Concepción' }, { label: 'Huambalpa' }, { label: 'Independencia' }, { label: 'Saurama' }, { label: 'Vischongo' }] },
    ],
  },
  {
    label: 'Cajamarca',
    provincias: [
      { label: 'Cajamarca', distritos: [{ label: 'Cajamarca' }, { label: 'Asunción' }, { label: 'Chetilla' }, { label: 'Cosspán' }, { label: 'Encañada' }, { label: 'Jesús' }, { label: 'Llacanora' }, { label: 'Los Baños del Inca' }, { label: 'Magdalena' }, { label: 'Matara' }, { label: 'Namora' }, { label: 'San Juan' }] },
      { label: 'Cajabamba', distritos: [{ label: 'Cajabamba' }, { label: 'Cachachi' }, { label: 'Condebamba' }, { label: 'Sitacocha' }] },
      { label: 'Celendín', distritos: [{ label: 'Celendín' }, { label: 'Chumuch' }, { label: 'Cortegana' }, { label: 'Huasmín' }, { label: 'Jorge Chávez' }, { label: 'José Gálvez' }, { label: 'Miguel Iglesias' }, { label: 'Oxamarca' }, { label: 'Sorochuco' }, { label: 'Sucre' }, { label: 'Utco' }, { label: 'La Libertad de Pallán' }] },
      { label: 'Chota', distritos: [{ label: 'Chota' }, { label: 'Anguía' }, { label: 'Chadín' }, { label: 'Chiguirip' }, { label: 'Chimban' }, { label: 'Choropampa' }, { label: 'Cochabamba' }, { label: 'Conchan' }, { label: 'Huambos' }, { label: 'Lajas' }, { label: 'Llama' }, { label: 'Miracosta' }, { label: 'Paccha' }, { label: 'Pion' }, { label: 'Querocoto' }, { label: 'San Juan de Licupis' }, { label: 'Tacabamba' }, { label: 'Tocmoche' }, { label: 'Chalamarca' }] },
      { label: 'Contumazá', distritos: [{ label: 'Contumazá' }, { label: 'Chilete' }, { label: 'Cupisnique' }, { label: 'Guzmango' }, { label: 'San Benito' }, { label: 'Santa Cruz de Toledo' }, { label: 'Tantarica' }, { label: 'Yonán' }] },
      { label: 'Cutervo', distritos: [{ label: 'Cutervo' }, { label: 'Callayuc' }, { label: 'Choros' }, { label: 'Cujillo' }, { label: 'La Ramada' }, { label: 'Pimpingos' }, { label: 'Querocotillo' }, { label: 'San Andrés de Cutervo' }, { label: 'San Juan de Cutervo' }, { label: 'San Luis de Lucma' }, { label: 'Santa Cruz' }, { label: 'Santo Domingo de la Capilla' }, { label: 'Santo Tomás' }, { label: 'Socota' }, { label: 'Toribio Casanova' }] },
      { label: 'Hualgayoc', distritos: [{ label: 'Bambamarca' }, { label: 'Chugur' }, { label: 'Hualgayoc' }] },
      { label: 'Jaén', distritos: [{ label: 'Jaén' }, { label: 'Bellavista' }, { label: 'Chontali' }, { label: 'Colasay' }, { label: 'Huabal' }, { label: 'Las Pirias' }, { label: 'Pomahuaca' }, { label: 'Pucará' }, { label: 'Sallique' }, { label: 'San Felipe' }, { label: 'San José del Alto' }, { label: 'Santa Rosa' }] },
      { label: 'San Ignacio', distritos: [{ label: 'San Ignacio' }, { label: 'Chirinos' }, { label: 'Huarango' }, { label: 'La Coipa' }, { label: 'Namballe' }, { label: 'San José de Lourdes' }, { label: 'Tabaconas' }] },
      { label: 'San Marcos', distritos: [{ label: 'Pedro Gálvez' }, { label: 'Chancay' }, { label: 'Eduardo Villanueva' }, { label: 'Gregorio Pita' }, { label: 'Ichocán' }, { label: 'José Manuel Quiroz' }, { label: 'José Sabogal' }] },
      { label: 'San Miguel', distritos: [{ label: 'San Miguel' }, { label: 'Bolívar' }, { label: 'Calquis' }, { label: 'Catilluc' }, { label: 'El Prado' }, { label: 'La Florida' }, { label: 'Llapa' }, { label: 'Nanchoc' }, { label: 'Niepos' }, { label: 'San Gregorio' }, { label: 'San Silvestre de Cochán' }, { label: 'Tongod' }, { label: 'Unión Agua Blanca' }] },
      { label: 'San Pablo', distritos: [{ label: 'San Pablo' }, { label: 'San Bernardino' }, { label: 'San Luis' }, { label: 'Tumbadén' }] },
      { label: 'Santa Cruz', distritos: [{ label: 'Santa Cruz' }, { label: 'Andabamba' }, { label: 'Catache' }, { label: 'Chancaybaños' }, { label: 'La Esperanza' }, { label: 'Ninabamba' }, { label: 'Pulan' }, { label: 'Saucepampa' }, { label: 'Sexi' }, { label: 'Uticyacu' }, { label: 'Yauyucán' }] },
    ],
  },
  {
    label: 'Callao',
    provincias: [
      { label: 'Callao', distritos: [{ label: 'Callao' }, { label: 'Bellavista' }, { label: 'Carmen de la Legua Reynoso' }, { label: 'La Perla' }, { label: 'La Punta' }, { label: 'Ventanilla' }, { label: 'Mi Perú' }] },
    ],
  },
  {
    label: 'Cusco',
    provincias: [
      { label: 'Cusco', distritos: [{ label: 'Cusco' }, { label: 'Ccorca' }, { label: 'Poroy' }, { label: 'San Jerónimo' }, { label: 'San Sebastián' }, { label: 'Santiago' }, { label: 'Saylla' }, { label: 'Wanchaq' }] },
      { label: 'Acomayo', distritos: [{ label: 'Acomayo' }, { label: 'Acopia' }, { label: 'Acos' }, { label: 'Mosoc Llacta' }, { label: 'Pomacanchi' }, { label: 'Rondocan' }, { label: 'Sangarará' }] },
      { label: 'Anta', distritos: [{ label: 'Anta' }, { label: 'Ancahuasi' }, { label: 'Cachimayo' }, { label: 'Chinchaypujio' }, { label: 'Huarocondo' }, { label: 'Limatambo' }, { label: 'Mollepata' }, { label: 'Pucyura' }, { label: 'Zurite' }] },
      { label: 'Calca', distritos: [{ label: 'Calca' }, { label: 'Coya' }, { label: 'Lamay' }, { label: 'Lares' }, { label: 'Pisac' }, { label: 'San Salvador' }, { label: 'Taray' }, { label: 'Yanatile' }] },
      { label: 'Canas', distritos: [{ label: 'Yanaoca' }, { label: 'Checca' }, { label: 'Kunturkanki' }, { label: 'Langui' }, { label: 'Layo' }, { label: 'Pampamarca' }, { label: 'Quehue' }, { label: 'Túpac Amaru' }] },
      { label: 'Canchis', distritos: [{ label: 'Sicuani' }, { label: 'Checacupe' }, { label: 'Combapata' }, { label: 'Marangani' }, { label: 'Pitumarca' }, { label: 'San Pablo' }, { label: 'San Pedro' }, { label: 'Tinta' }] },
      { label: 'Chumbivilcas', distritos: [{ label: 'Santo Tomás' }, { label: 'Capacmarca' }, { label: 'Chamaca' }, { label: 'Colquemarca' }, { label: 'Livitaca' }, { label: 'Llusco' }, { label: 'Quiñota' }, { label: 'Velille' }] },
      { label: 'Espinar', distritos: [{ label: 'Espinar' }, { label: 'Condoroma' }, { label: 'Coporaque' }, { label: 'Ocoruro' }, { label: 'Pallpata' }, { label: 'Pichigua' }, { label: 'Suyckutambo' }, { label: 'Alto Pichigua' }] },
      { label: 'La Convención', distritos: [{ label: 'Santa Ana' }, { label: 'Echarati' }, { label: 'Huayopata' }, { label: 'Maranura' }, { label: 'Ocobamba' }, { label: 'Quellouno' }, { label: 'Kimbiri' }, { label: 'Santa Teresa' }, { label: 'Vilcabamba' }, { label: 'Pichari' }, { label: 'Inkawasi' }, { label: 'Villa Virgen' }, { label: 'Villa Kintiarina' }, { label: 'Megantoni' }] },
      { label: 'Paruro', distritos: [{ label: 'Paruro' }, { label: 'Accha' }, { label: 'Ccapi' }, { label: 'Colcha' }, { label: 'Huanoquite' }, { label: 'Omacha' }, { label: 'Paccaritambo' }, { label: 'Pillpinto' }, { label: 'Yaurisque' }] },
      { label: 'Paucartambo', distritos: [{ label: 'Paucartambo' }, { label: 'Caicay' }, { label: 'Challabamba' }, { label: 'Colquepata' }, { label: 'Huancarani' }, { label: 'Kosñipata' }] },
      { label: 'Quispicanchi', distritos: [{ label: 'Urcos' }, { label: 'Andahuaylillas' }, { label: 'Camanti' }, { label: 'Ccarhuayo' }, { label: 'Ccatca' }, { label: 'Cusipata' }, { label: 'Huaro' }, { label: 'Lucre' }, { label: 'Marcapata' }, { label: 'Ocongate' }, { label: 'Oropesa' }, { label: 'Quiquijana' }] },
      { label: 'Urubamba', distritos: [{ label: 'Urubamba' }, { label: 'Chinchero' }, { label: 'Huayllabamba' }, { label: 'Machupicchu' }, { label: 'Maras' }, { label: 'Ollantaytambo' }, { label: 'Yucay' }] },
    ],
  },
  {
    label: 'Huancavelica',
    provincias: [
      { label: 'Huancavelica', distritos: [{ label: 'Huancavelica' }, { label: 'Acobambilla' }, { label: 'Acoria' }, { label: 'Conayca' }, { label: 'Cuenca' }, { label: 'Huachocolpa' }, { label: 'Huayllahuara' }, { label: 'Izcuchaca' }, { label: 'Laria' }, { label: 'Manta' }, { label: 'Mariscal Cáceres' }, { label: 'Moya' }, { label: 'Nuevo Occoro' }, { label: 'Palca' }, { label: 'Pilchaca' }, { label: 'Vilca' }, { label: 'Yauli' }, { label: 'Ascensión' }, { label: 'Huando' }] },
      { label: 'Acobamba', distritos: [{ label: 'Acobamba' }, { label: 'Andabamba' }, { label: 'Anta' }, { label: 'Caja' }, { label: 'Marcas' }, { label: 'Paucará' }, { label: 'Pomacocha' }, { label: 'Rosario' }] },
      { label: 'Angaraes', distritos: [{ label: 'Lircay' }, { label: 'Anchonga' }, { label: 'Callanmarca' }, { label: 'Ccochaccasa' }, { label: 'Chincho' }, { label: 'Congalla' }, { label: 'Huanca Huanca' }, { label: 'Huayllay Grande' }, { label: 'Julcamarca' }, { label: 'San Antonio de Antaparco' }, { label: 'Santo Tomás de Pata' }, { label: 'Secclla' }] },
      { label: 'Castrovirreyna', distritos: [{ label: 'Castrovirreyna' }, { label: 'Arma' }, { label: 'Aurahuá' }, { label: 'Capillas' }, { label: 'Chupamarca' }, { label: 'Cocas' }, { label: 'Huachos' }, { label: 'Huamatambo' }, { label: 'Mollepampa' }, { label: 'San Juan' }, { label: 'Santa Ana' }, { label: 'Tantará' }, { label: 'Ticrapo' }] },
      { label: 'Churcampa', distritos: [{ label: 'Churcampa' }, { label: 'Anco' }, { label: 'Chinchihuasi' }, { label: 'El Carmen' }, { label: 'La Merced' }, { label: 'Locroja' }, { label: 'Paucarbamba' }, { label: 'San Miguel de Mayocc' }, { label: 'San Pedro de Coris' }, { label: 'Pachamarca' }, { label: 'Cosme' }] },
      { label: 'Huaytará', distritos: [{ label: 'Huaytará' }, { label: 'Ayaví' }, { label: 'Córdova' }, { label: 'Huayacundo Arma' }, { label: 'Laramarca' }, { label: 'Ocoyo' }, { label: 'Pilpichaca' }, { label: 'Querco' }, { label: 'Quito-Arma' }, { label: 'San Antonio de Cusicancha' }, { label: 'San Francisco de Sangayaico' }, { label: 'San Isidro' }, { label: 'Santiago de Chocorvos' }, { label: 'Santiago de Quirahuará' }, { label: 'Santo Domingo de Capillas' }, { label: 'Tambo' }] },
      { label: 'Tayacaja', distritos: [{ label: 'Pampas' }, { label: 'Acostambo' }, { label: 'Acraquia' }, { label: 'Ahuaycha' }, { label: 'Colcabamba' }, { label: 'Daniel Hernández' }, { label: 'Huachocolpa' }, { label: 'Huaribamba' }, { label: 'Ñahuimpuquio' }, { label: 'Pazos' }, { label: 'Quishuar' }, { label: 'Salcabamba' }, { label: 'Salcahuasi' }, { label: 'San Marcos de Rocchac' }, { label: 'Surcubamba' }, { label: 'Tintay Puncu' }, { label: 'Quichuas' }, { label: 'Andaymarca' }, { label: 'Roble' }, { label: 'Pichos' }, { label: 'Santiago de Tucuma' }] },
    ],
  },
  {
    label: 'Huánuco',
    provincias: [
      { label: 'Huánuco', distritos: [{ label: 'Huánuco' }, { label: 'Amarilis' }, { label: 'Chinchao' }, { label: 'Churubamba' }, { label: 'Margos' }, { label: 'Quisqui' }, { label: 'San Francisco de Cayrán' }, { label: 'San Pedro de Chaulán' }, { label: 'Santa María del Valle' }, { label: 'Yarumayo' }, { label: 'Pillco Marca' }, { label: 'Yacus' }, { label: 'San Pablo de Pillao' }] },
      { label: 'Ambo', distritos: [{ label: 'Ambo' }, { label: 'Cayna' }, { label: 'Colpas' }, { label: 'Conchamarca' }, { label: 'Huácar' }, { label: 'San Francisco' }, { label: 'San Rafael' }, { label: 'Tomay Kichwa' }] },
      { label: 'Dos de Mayo', distritos: [{ label: 'La Unión' }, { label: 'Chuquis' }, { label: 'Marías' }, { label: 'Pachas' }, { label: 'Quivilla' }, { label: 'Ripán' }, { label: 'Shunqui' }, { label: 'Sillapata' }, { label: 'Yanas' }] },
      { label: 'Huacaybamba', distritos: [{ label: 'Huacaybamba' }, { label: 'Canchabamba' }, { label: 'Cochabamba' }, { label: 'Pinra' }] },
      { label: 'Huamalíes', distritos: [{ label: 'Llata' }, { label: 'Arancay' }, { label: 'Chavín de Pariarca' }, { label: 'Jacas Grande' }, { label: 'Jircán' }, { label: 'Miraflores' }, { label: 'Monzón' }, { label: 'Punchao' }, { label: 'Puños' }, { label: 'Singa' }, { label: 'Tantamayo' }] },
      { label: 'Leoncio Prado', distritos: [{ label: 'Rupa-Rupa' }, { label: 'Daniel Alomía Robles' }, { label: 'Hermilio Valdizán' }, { label: 'José Crespo y Castillo' }, { label: 'Luyando' }, { label: 'Mariano Dámaso Beraún' }, { label: 'Pucayacu' }, { label: 'Castillo Grande' }, { label: 'Pueblo Nuevo' }, { label: 'Santo Domingo de Anda' }] },
      { label: 'Marañón', distritos: [{ label: 'Huacrachuco' }, { label: 'Cholón' }, { label: 'San Buenaventura' }, { label: 'La Morada' }, { label: 'Santa Rosa de Alto Yanajanca' }] },
      { label: 'Pachitea', distritos: [{ label: 'Panao' }, { label: 'Chaglla' }, { label: 'Molino' }, { label: 'Umari' }] },
      { label: 'Puerto Inca', distritos: [{ label: 'Puerto Inca' }, { label: 'Codo del Pozuzo' }, { label: 'Honoria' }, { label: 'Tournavista' }, { label: 'Yuyapichis' }] },
      { label: 'Lauricocha', distritos: [{ label: 'Jesús' }, { label: 'Baños' }, { label: 'Jivia' }, { label: 'Queropalca' }, { label: 'Rondos' }, { label: 'San Francisco de Asís' }, { label: 'San Miguel de Cauri' }] },
      { label: 'Yarowilca', distritos: [{ label: 'Chavinillo' }, { label: 'Cahuac' }, { label: 'Chacabamba' }, { label: 'Aparicio Pomares' }, { label: 'Jacas Chico' }, { label: 'Obas' }, { label: 'Pampamarca' }, { label: 'Choras' }] },
    ],
  },
  {
    label: 'Ica',
    provincias: [
      { label: 'Ica', distritos: [{ label: 'Ica' }, { label: 'La Tinguiña' }, { label: 'Los Aquijes' }, { label: 'Ocucaje' }, { label: 'Pachacútec' }, { label: 'Parcona' }, { label: 'Pueblo Nuevo' }, { label: 'Salas' }, { label: 'San José de Los Molinos' }, { label: 'San Juan Bautista' }, { label: 'Santiago' }, { label: 'Subtanjalla' }, { label: 'Tate' }, { label: 'Yauca del Rosario' }] },
      { label: 'Chincha', distritos: [{ label: 'Chincha Alta' }, { label: 'Alto Larán' }, { label: 'Chavín' }, { label: 'Chincha Baja' }, { label: 'El Carmen' }, { label: 'Grocio Prado' }, { label: 'Pueblo Nuevo' }, { label: 'San Juan de Yanac' }, { label: 'San Pedro de Huacarpana' }, { label: 'Sunampe' }, { label: 'Tambo de Mora' }] },
      { label: 'Nazca', distritos: [{ label: 'Nazca' }, { label: 'Changuillo' }, { label: 'El Ingenio' }, { label: 'Marcona' }, { label: 'Vista Alegre' }] },
      { label: 'Palpa', distritos: [{ label: 'Palpa' }, { label: 'Llipata' }, { label: 'Río Grande' }, { label: 'Santa Cruz' }, { label: 'Tibillo' }] },
      { label: 'Pisco', distritos: [{ label: 'Pisco' }, { label: 'Huancano' }, { label: 'Humay' }, { label: 'Independencia' }, { label: 'Paracas' }, { label: 'San Andrés' }, { label: 'San Clemente' }, { label: 'Túpac Amaru Inca' }] },
    ],
  },
  {
    label: 'Junín',
    provincias: [
      { label: 'Huancayo', distritos: [{ label: 'Huancayo' }, { label: 'Carhuacallanga' }, { label: 'Chacapampa' }, { label: 'Chicche' }, { label: 'Chilca' }, { label: 'Chongos Alto' }, { label: 'Chupuro' }, { label: 'Colca' }, { label: 'Cullhuas' }, { label: 'El Tambo' }, { label: 'Huacrapuquio' }, { label: 'Hualhuas' }, { label: 'Huancan' }, { label: 'Huasicancha' }, { label: 'Huayucachi' }, { label: 'Ingenio' }, { label: 'Pariahuanca' }, { label: 'Pilcomayo' }, { label: 'Pucará' }, { label: 'Quichuay' }, { label: 'Quilcas' }, { label: 'San Agustín' }, { label: 'San Jerónimo de Tunán' }, { label: 'Saño' }, { label: 'Sapallanga' }, { label: 'Sicaya' }, { label: 'Santo Domingo de Acobamba' }, { label: 'Viques' }] },
      { label: 'Concepción', distritos: [{ label: 'Concepción' }, { label: 'Aco' }, { label: 'Andamarca' }, { label: 'Chambará' }, { label: 'Cochas' }, { label: 'Comas' }, { label: 'Heroínas Toledo' }, { label: 'Manzanares' }, { label: 'Mariscal Castilla' }, { label: 'Matahuasi' }, { label: 'Mito' }, { label: 'Nueve de Julio' }, { label: 'Orcotuna' }, { label: 'San José de Quero' }, { label: 'Santa Rosa de Ocopa' }] },
      { label: 'Chanchamayo', distritos: [{ label: 'Chanchamayo' }, { label: 'Perené' }, { label: 'Pichanaqui' }, { label: 'San Luis de Shuaro' }, { label: 'San Ramón' }, { label: 'Vitoc' }] },
      { label: 'Jauja', distritos: [{ label: 'Jauja' }, { label: 'Acolla' }, { label: 'Apata' }, { label: 'Ataura' }, { label: 'Canchayllo' }, { label: 'El Mantaro' }, { label: 'Huamalí' }, { label: 'Huaripampa' }, { label: 'Huertas' }, { label: 'Janjaillo' }, { label: 'Julcán' }, { label: 'Leonor Ordóñez' }, { label: 'Llocllapampa' }, { label: 'Marco' }, { label: 'Masma' }, { label: 'Masma Chicche' }, { label: 'Molinos' }, { label: 'Monobamba' }, { label: 'Muqui' }, { label: 'Muquiyauyo' }, { label: 'Paca' }, { label: 'Paccha' }, { label: 'Pancan' }, { label: 'Parco' }, { label: 'Pomacancha' }, { label: 'Ricran' }, { label: 'San Lorenzo' }, { label: 'San Pedro de Chunan' }, { label: 'Sausa' }, { label: 'Sincos' }, { label: 'Tunan Marca' }, { label: 'Yauli' }, { label: 'Curicaca' }, { label: 'Yauyos' }] },
      { label: 'Junín', distritos: [{ label: 'Junín' }, { label: 'Carhuamayo' }, { label: 'Ondores' }, { label: 'Ulcumayo' }] },
      { label: 'Satipo', distritos: [{ label: 'Satipo' }, { label: 'Coviriali' }, { label: 'Llaylla' }, { label: 'Mazamari' }, { label: 'Pampa Hermosa' }, { label: 'Pangoa' }, { label: 'Río Negro' }, { label: 'Río Tambo' }, { label: 'Vizcatán del Ene' }] },
      { label: 'Tarma', distritos: [{ label: 'Tarma' }, { label: 'Acobamba' }, { label: 'Huaricolca' }, { label: 'Huasahuasi' }, { label: 'La Unión' }, { label: 'Palca' }, { label: 'Palcamayo' }, { label: 'San Pedro de Cajas' }, { label: 'Tapo' }] },
      { label: 'Yauli', distritos: [{ label: 'La Oroya' }, { label: 'Chacapalpa' }, { label: 'Huay-Huay' }, { label: 'Marcapomacocha' }, { label: 'Morococha' }, { label: 'Paccha' }, { label: 'Santa Bárbara de Carhuacayán' }, { label: 'Santa Rosa de Sacco' }, { label: 'Suitucancha' }, { label: 'Yauli' }] },
      { label: 'Chupaca', distritos: [{ label: 'Chupaca' }, { label: 'Ahuac' }, { label: 'Chongos Bajo' }, { label: 'Huachac' }, { label: 'Huamancaca Chico' }, { label: 'San Juan de Iscos' }, { label: 'San Juan de Jarpa' }, { label: 'Tres de Diciembre' }, { label: 'Yanacancha' }] },
    ],
  },
  {
    label: 'La Libertad',
    provincias: [
      { label: 'Trujillo', distritos: [{ label: 'Trujillo' }, { label: 'El Porvenir' }, { label: 'Florencia de Mora' }, { label: 'Huanchaco' }, { label: 'La Esperanza' }, { label: 'Laredo' }, { label: 'Moche' }, { label: 'Poroto' }, { label: 'Salaverry' }, { label: 'Simbal' }, { label: 'Víctor Larco Herrera' }] },
      { label: 'Ascope', distritos: [{ label: 'Ascope' }, { label: 'Chicama' }, { label: 'Chocope' }, { label: 'Magdalena de Cao' }, { label: 'Paiján' }, { label: 'Rázuri' }, { label: 'Santiago de Cao' }, { label: 'Casa Grande' }] },
      { label: 'Bolívar', distritos: [{ label: 'Bolívar' }, { label: 'Bambamarca' }, { label: 'Condormarca' }, { label: 'Longotea' }, { label: 'Uchumarca' }, { label: 'Ucuncha' }] },
      { label: 'Chepén', distritos: [{ label: 'Chepén' }, { label: 'Pacanga' }, { label: 'Pueblo Nuevo' }] },
      { label: 'Julcán', distritos: [{ label: 'Julcán' }, { label: 'Calamarca' }, { label: 'Carabamba' }, { label: 'Huaso' }] },
      { label: 'Otuzco', distritos: [{ label: 'Otuzco' }, { label: 'Agallpampa' }, { label: 'Charat' }, { label: 'Huaranchal' }, { label: 'La Cuesta' }, { label: 'Mache' }, { label: 'Paranday' }, { label: 'Salpo' }, { label: 'Sinsicap' }, { label: 'Usquil' }] },
      { label: 'Pacasmayo', distritos: [{ label: 'San Pedro de Lloc' }, { label: 'Guadalupe' }, { label: 'Jequetepeque' }, { label: 'Pacasmayo' }, { label: 'San José' }] },
      { label: 'Pataz', distritos: [{ label: 'Tayabamba' }, { label: 'Buldibuyo' }, { label: 'Chillia' }, { label: 'Huancaspata' }, { label: 'Huaylillas' }, { label: 'Huayo' }, { label: 'Ongón' }, { label: 'Parcoy' }, { label: 'Pataz' }, { label: 'Pías' }, { label: 'Santiago de Challas' }, { label: 'Taurija' }, { label: 'Urpay' }] },
      { label: 'Sánchez Carrión', distritos: [{ label: 'Huamachuco' }, { label: 'Chugay' }, { label: 'Cochorco' }, { label: 'Curgos' }, { label: 'Marcabal' }, { label: 'Sanagoran' }, { label: 'Sarín' }, { label: 'Sartimbamba' }] },
      { label: 'Santiago de Chuco', distritos: [{ label: 'Santiago de Chuco' }, { label: 'Angasmarca' }, { label: 'Cachicadán' }, { label: 'Mollebamba' }, { label: 'Mollepata' }, { label: 'Quiruvilca' }, { label: 'Santa Cruz de Chuca' }, { label: 'Sitabamba' }] },
      { label: 'Gran Chimú', distritos: [{ label: 'Cascas' }, { label: 'Lucma' }, { label: 'Marmot' }, { label: 'Sayapullo' }] },
      { label: 'Virú', distritos: [{ label: 'Virú' }, { label: 'Chao' }, { label: 'Guadalupito' }] },
    ],
  },
  {
    label: 'Lambayeque',
    provincias: [
      { label: 'Chiclayo', distritos: [{ label: 'Chiclayo' }, { label: 'Chongoyape' }, { label: 'Eten' }, { label: 'Eten Puerto' }, { label: 'José Leonardo Ortiz' }, { label: 'La Victoria' }, { label: 'Lagunas' }, { label: 'Monsefú' }, { label: 'Nueva Arica' }, { label: 'Oyotún' }, { label: 'Pátapo' }, { label: 'Picsi' }, { label: 'Pimentel' }, { label: 'Pomalca' }, { label: 'Pucalá' }, { label: 'Reque' }, { label: 'Santa Rosa' }, { label: 'Saña' }, { label: 'Cayaltí' }, { label: 'Tumán' }] },
      { label: 'Ferreñafe', distritos: [{ label: 'Ferreñafe' }, { label: 'Cañaris' }, { label: 'Incahuasi' }, { label: 'Manuel Antonio Mesones Muro' }, { label: 'Pítipo' }, { label: 'Pueblo Nuevo' }] },
      { label: 'Lambayeque', distritos: [{ label: 'Lambayeque' }, { label: 'Chóchope' }, { label: 'Illimo' }, { label: 'Jayanca' }, { label: 'Mochumí' }, { label: 'Mórrope' }, { label: 'Motupe' }, { label: 'Olmos' }, { label: 'Pacora' }, { label: 'Salas' }, { label: 'San José' }, { label: 'Túcume' }] },
    ],
  },
  {
    label: 'Lima',
    provincias: [
      { label: 'Lima', distritos: [{ label: 'Lima' }, { label: 'Ancón' }, { label: 'Ate' }, { label: 'Barranco' }, { label: 'Breña' }, { label: 'Carabayllo' }, { label: 'Chaclacayo' }, { label: 'Chorrillos' }, { label: 'Cieneguilla' }, { label: 'Comas' }, { label: 'El Agustino' }, { label: 'Independencia' }, { label: 'Jesús María' }, { label: 'La Molina' }, { label: 'La Victoria' }, { label: 'Lince' }, { label: 'Los Olivos' }, { label: 'Lurigancho' }, { label: 'Lurín' }, { label: 'Magdalena del Mar' }, { label: 'Miraflores' }, { label: 'Pachacámac' }, { label: 'Pucusana' }, { label: 'Pueblo Libre' }, { label: 'Puente Piedra' }, { label: 'Punta Hermosa' }, { label: 'Punta Negra' }, { label: 'Rímac' }, { label: 'San Bartolo' }, { label: 'San Borja' }, { label: 'San Isidro' }, { label: 'San Juan de Lurigancho' }, { label: 'San Juan de Miraflores' }, { label: 'San Luis' }, { label: 'San Martín de Porres' }, { label: 'San Miguel' }, { label: 'Santa Anita' }, { label: 'Santa María del Mar' }, { label: 'Santa Rosa' }, { label: 'Santiago de Surco' }, { label: 'Surquillo' }, { label: 'Villa El Salvador' }, { label: 'Villa María del Triunfo' }] },
      { label: 'Barranca', distritos: [{ label: 'Barranca' }, { label: 'Paramonga' }, { label: 'Pativilca' }, { label: 'Supe' }, { label: 'Supe Puerto' }] },
      { label: 'Cajatambo', distritos: [{ label: 'Cajatambo' }, { label: 'Copa' }, { label: 'Gorgor' }, { label: 'Huancapón' }, { label: 'Manas' }] },
      { label: 'Canta', distritos: [{ label: 'Canta' }, { label: 'Arahuay' }, { label: 'Huamantanga' }, { label: 'Huaros' }, { label: 'Lachaqui' }, { label: 'San Buenaventura' }, { label: 'Santa Rosa de Quives' }] },
      { label: 'Cañete', distritos: [{ label: 'San Vicente de Cañete' }, { label: 'Asia' }, { label: 'Calango' }, { label: 'Cerro Azul' }, { label: 'Chilca' }, { label: 'Coayllo' }, { label: 'Imperial' }, { label: 'Lunahuaná' }, { label: 'Mala' }, { label: 'Nuevo Imperial' }, { label: 'Pacarán' }, { label: 'Quilmaná' }, { label: 'San Antonio' }, { label: 'San Luis' }, { label: 'Santa Cruz de Flores' }, { label: 'Zúñiga' }] },
      { label: 'Huaral', distritos: [{ label: 'Huaral' }, { label: 'Atavillos Alto' }, { label: 'Atavillos Bajo' }, { label: 'Aucallama' }, { label: 'Chancay' }, { label: 'Ihuarí' }, { label: 'Lampián' }, { label: 'Pacaraos' }, { label: 'San Miguel de Acos' }, { label: 'Santa Cruz de Andamarca' }, { label: 'Sumbilca' }, { label: 'Veintisiete de Noviembre' }] },
      { label: 'Huarochirí', distritos: [{ label: 'Matucana' }, { label: 'Antioquía' }, { label: 'Callahuanca' }, { label: 'Carampoma' }, { label: 'Chicla' }, { label: 'Cuenca' }, { label: 'Huachupampa' }, { label: 'Huanza' }, { label: 'Huarochirí' }, { label: 'Lahuaytambo' }, { label: 'Langa' }, { label: 'Laraos' }, { label: 'Mariatana' }, { label: 'Ricardo Palma' }, { label: 'San Andrés de Tupicocha' }, { label: 'San Antonio' }, { label: 'San Bartolomé' }, { label: 'San Damián' }, { label: 'San Juan de Iris' }, { label: 'San Juan de Tantaranche' }, { label: 'San Lorenzo de Quinti' }, { label: 'San Mateo' }, { label: 'San Mateo de Otao' }, { label: 'San Pedro de Casta' }, { label: 'San Pedro de Huancayre' }, { label: 'Sangallaya' }, { label: 'Santa Cruz de Cocachacra' }, { label: 'Santa Eulalia' }, { label: 'Santiago de Anchucaya' }, { label: 'Santiago de Tuna' }, { label: 'Santo Domingo de los Olleros' }, { label: 'Surco' }] },
      { label: 'Huaura', distritos: [{ label: 'Huacho' }, { label: 'Ámbar' }, { label: 'Caleta de Carquín' }, { label: 'Checras' }, { label: 'Hualmay' }, { label: 'Huaura' }, { label: 'Leoncio Prado' }, { label: 'Paccho' }, { label: 'Santa Leonor' }, { label: 'Santa María' }, { label: 'Sayán' }, { label: 'Vegueta' }] },
      { label: 'Oyón', distritos: [{ label: 'Oyón' }, { label: 'Andajes' }, { label: 'Caujul' }, { label: 'Cochamarca' }, { label: 'Naván' }, { label: 'Pachangara' }] },
      { label: 'Yauyos', distritos: [{ label: 'Yauyos' }, { label: 'Alis' }, { label: 'Ayauca' }, { label: 'Ayavirí' }, { label: 'Azángaro' }, { label: 'Cacra' }, { label: 'Carania' }, { label: 'Catahuasi' }, { label: 'Chocos' }, { label: 'Cochas' }, { label: 'Colonia' }, { label: 'Hongos' }, { label: 'Huampara' }, { label: 'Huancaya' }, { label: 'Huangáscar' }, { label: 'Huañec' }, { label: 'Laraos' }, { label: 'Lincha' }, { label: 'Madean' }, { label: 'Miraflores' }, { label: 'Omas' }, { label: 'Putinza' }, { label: 'Quinches' }, { label: 'Quinocay' }, { label: 'San Joaquín' }, { label: 'San Pedro de Pilas' }, { label: 'Tanta' }, { label: 'Tauripampa' }, { label: 'Tomas' }, { label: 'Tupe' }, { label: 'Viñac' }, { label: 'Vitis' }] },
    ],
  },
  {
    label: 'Loreto',
    provincias: [
      { label: 'Maynas', distritos: [{ label: 'Iquitos' }, { label: 'Alto Nanay' }, { label: 'Fernando Lores' }, { label: 'Indiana' }, { label: 'Las Amazonas' }, { label: 'Mazán' }, { label: 'Napo' }, { label: 'Punchana' }, { label: 'Torres Causana' }, { label: 'Belén' }, { label: 'San Juan Bautista' }] },
      { label: 'Alto Amazonas', distritos: [{ label: 'Yurimaguas' }, { label: 'Balsapuerto' }, { label: 'Jeberos' }, { label: 'Lagunas' }, { label: 'Santa Cruz' }, { label: 'Teniente César López Rojas' }] },
      { label: 'Loreto', distritos: [{ label: 'Nauta' }, { label: 'Parinari' }, { label: 'Tigre' }, { label: 'Trompeteros' }, { label: 'Urarinas' }] },
      { label: 'Mariscal Ramón Castilla', distritos: [{ label: 'Ramón Castilla' }, { label: 'Pebas' }, { label: 'Yavari' }, { label: 'San Pablo' }] },
      { label: 'Requena', distritos: [{ label: 'Requena' }, { label: 'Alto Tapiche' }, { label: 'Capelo' }, { label: 'Emilio San Martín' }, { label: 'Maquia' }, { label: 'Puinahua' }, { label: 'Saquena' }, { label: 'Soplin' }, { label: 'Tapiche' }, { label: 'Jenaro Herrera' }, { label: 'Yaquerana' }] },
      { label: 'Ucayali', distritos: [{ label: 'Contamana' }, { label: 'Inahuaya' }, { label: 'Padre Márquez' }, { label: 'Pampa Hermosa' }, { label: 'Sarayacu' }, { label: 'Vargas Guerra' }] },
      { label: 'Datem del Marañón', distritos: [{ label: 'Barranca' }, { label: 'Cahuapanas' }, { label: 'Manseriche' }, { label: 'Morona' }, { label: 'Pastaza' }, { label: 'Andoas' }] },
      { label: 'Putumayo', distritos: [{ label: 'Putumayo' }, { label: 'Rosa Panduro' }, { label: 'Teniente Manuel Clavero' }, { label: 'Yaguas' }] },
    ],
  },
  {
    label: 'Madre de Dios',
    provincias: [
      { label: 'Tambopata', distritos: [{ label: 'Tambopata' }, { label: 'Inambari' }, { label: 'Las Piedras' }, { label: 'Laberinto' }] },
      { label: 'Manu', distritos: [{ label: 'Manu' }, { label: 'Fitzcarrald' }, { label: 'Madre de Dios' }, { label: 'Huepetuhe' }] },
      { label: 'Tahuamanu', distritos: [{ label: 'Iñapari' }, { label: 'Iberia' }, { label: 'Tahuamanu' }] },
    ],
  },
  {
    label: 'Moquegua',
    provincias: [
      { label: 'Mariscal Nieto', distritos: [{ label: 'Moquegua' }, { label: 'Carumas' }, { label: 'Cuchumbaya' }, { label: 'Samegua' }, { label: 'San Cristóbal' }, { label: 'Torata' }] },
      { label: 'General Sánchez Cerro', distritos: [{ label: 'Omate' }, { label: 'Chojata' }, { label: 'Coalaque' }, { label: 'Ichuña' }, { label: 'La Capilla' }, { label: 'Lloque' }, { label: 'Matalaque' }, { label: 'Puquina' }, { label: 'Quinistaquillas' }, { label: 'Ubinas' }, { label: 'Yunga' }] },
      { label: 'Ilo', distritos: [{ label: 'Ilo' }, { label: 'El Algarrobal' }, { label: 'Pacocha' }] },
    ],
  },
  {
    label: 'Pasco',
    provincias: [
      { label: 'Pasco', distritos: [{ label: 'Chaupimarca' }, { label: 'Huachón' }, { label: 'Huariaca' }, { label: 'Huayllay' }, { label: 'Ninacaca' }, { label: 'Pallanchacra' }, { label: 'Paucartambo' }, { label: 'San Francisco de Asís de Yarusyacán' }, { label: 'Simón Bolívar' }, { label: 'Ticlacayán' }, { label: 'Tinyahuarco' }, { label: 'Vicco' }, { label: 'Yanacancha' }] },
      { label: 'Daniel Alcides Carrión', distritos: [{ label: 'Yanahuanca' }, { label: 'Chacayán' }, { label: 'Goyllarisquizga' }, { label: 'Paucar' }, { label: 'San Pedro de Pillao' }, { label: 'Santa Ana de Tusi' }, { label: 'Tapuc' }, { label: 'Vilcabamba' }] },
      { label: 'Oxapampa', distritos: [{ label: 'Oxapampa' }, { label: 'Chontabamba' }, { label: 'Huancabamba' }, { label: 'Palcazú' }, { label: 'Pozuzo' }, { label: 'Puerto Bermúdez' }, { label: 'Villa Rica' }, { label: 'Constitución' }] },
    ],
  },
  {
    label: 'Piura',
    provincias: [
      { label: 'Piura', distritos: [{ label: 'Piura' }, { label: 'Castilla' }, { label: 'Catacaos' }, { label: 'Cura Mori' }, { label: 'El Tallán' }, { label: 'La Arena' }, { label: 'La Unión' }, { label: 'Las Lomas' }, { label: 'Tambo Grande' }, { label: 'Veintiséis de Octubre' }] },
      { label: 'Ayabaca', distritos: [{ label: 'Ayabaca' }, { label: 'Frías' }, { label: 'Jilili' }, { label: 'Lagunas' }, { label: 'Montero' }, { label: 'Pacaipampa' }, { label: 'Paimas' }, { label: 'Sapillica' }, { label: 'Sicchez' }, { label: 'Suyo' }] },
      { label: 'Huancabamba', distritos: [{ label: 'Huancabamba' }, { label: 'Canchaque' }, { label: 'El Carmen de la Frontera' }, { label: 'Huarmaca' }, { label: 'Lalaquiz' }, { label: 'San Miguel de El Faique' }, { label: 'Sóndor' }, { label: 'Sondorillo' }] },
      { label: 'Morropón', distritos: [{ label: 'Chulucanas' }, { label: 'Buenos Aires' }, { label: 'Chalaco' }, { label: 'La Matanza' }, { label: 'Morropón' }, { label: 'Salitral' }, { label: 'San Juan de Bigote' }, { label: 'Santa Catalina de Mossa' }, { label: 'Santo Domingo' }, { label: 'Yamango' }] },
      { label: 'Paita', distritos: [{ label: 'Paita' }, { label: 'Amotape' }, { label: 'Arenal' }, { label: 'Colán' }, { label: 'La Huaca' }, { label: 'Tamarindo' }, { label: 'Vichayal' }] },
      { label: 'Sullana', distritos: [{ label: 'Sullana' }, { label: 'Bellavista' }, { label: 'Ignacio Escudero' }, { label: 'Lancones' }, { label: 'Marcavelica' }, { label: 'Miguel Checa' }, { label: 'Querecotillo' }, { label: 'Salitral' }] },
      { label: 'Sechura', distritos: [{ label: 'Sechura' }, { label: 'Bellavista de la Unión' }, { label: 'Bernal' }, { label: 'Cristo Nos Valga' }, { label: 'Vice' }, { label: 'Rinconada Llicuar' }] },
      { label: 'Talara', distritos: [{ label: 'Pariñas' }, { label: 'El Alto' }, { label: 'La Brea' }, { label: 'Lobitos' }, { label: 'Los Órganos' }, { label: 'Máncora' }] },
    ],
  },
  {
    label: 'Puno',
    provincias: [
      { label: 'Puno', distritos: [{ label: 'Puno' }, { label: 'Acora' }, { label: 'Amantani' }, { label: 'Atuncolla' }, { label: 'Capachica' }, { label: 'Chucuito' }, { label: 'Coata' }, { label: 'Huata' }, { label: 'Mañazo' }, { label: 'Paucarcolla' }, { label: 'Pichacani' }, { label: 'Platería' }, { label: 'San Antonio' }, { label: 'Tiquillaca' }, { label: 'Vilque' }] },
      { label: 'Azángaro', distritos: [{ label: 'Azángaro' }, { label: 'Achaya' }, { label: 'Arapa' }, { label: 'Asillo' }, { label: 'Caminaca' }, { label: 'Chupa' }, { label: 'José Domingo Choquehuanca' }, { label: 'Muñani' }, { label: 'Potoni' }, { label: 'Saman' }, { label: 'San Antón' }, { label: 'San José' }, { label: 'San Juan de Salinas' }, { label: 'Santiago de Pupuja' }, { label: 'Tirapata' }] },
      { label: 'Carabaya', distritos: [{ label: 'Macusani' }, { label: 'Ajoyani' }, { label: 'Ayapata' }, { label: 'Coasa' }, { label: 'Corani' }, { label: 'Crucero' }, { label: 'Ituata' }, { label: 'Ollachea' }, { label: 'San Gabán' }, { label: 'Usicayos' }] },
      { label: 'Chucuito', distritos: [{ label: 'Juli' }, { label: 'Desaguadero' }, { label: 'Huacullani' }, { label: 'Kelluyo' }, { label: 'Pisacoma' }, { label: 'Pomata' }, { label: 'Zepita' }] },
      { label: 'El Collao', distritos: [{ label: 'Ilave' }, { label: 'Capazo' }, { label: 'Pilcuyo' }, { label: 'Santa Rosa' }, { label: 'Conduriri' }] },
      { label: 'Huancané', distritos: [{ label: 'Huancané' }, { label: 'Cojata' }, { label: 'Huatasani' }, { label: 'Inchupalla' }, { label: 'Pusi' }, { label: 'Rosaspata' }, { label: 'Taraco' }, { label: 'Vilque Chico' }] },
      { label: 'Lampa', distritos: [{ label: 'Lampa' }, { label: 'Cabanilla' }, { label: 'Calapuja' }, { label: 'Nicasio' }, { label: 'Ocuviri' }, { label: 'Palca' }, { label: 'Paratía' }, { label: 'Pucará' }, { label: 'Santa Lucía' }, { label: 'Vilavila' }] },
      { label: 'Melgar', distritos: [{ label: 'Ayaviri' }, { label: 'Antauta' }, { label: 'Cupi' }, { label: 'Llalli' }, { label: 'Macari' }, { label: 'Nuñoa' }, { label: 'Orurillo' }, { label: 'Santa Rosa' }, { label: 'Umachiri' }] },
      { label: 'Moho', distritos: [{ label: 'Moho' }, { label: 'Conima' }, { label: 'Huayrapata' }, { label: 'Tilali' }] },
      { label: 'San Antonio de Putina', distritos: [{ label: 'Putina' }, { label: 'Ananea' }, { label: 'Pedro Vilca Apaza' }, { label: 'Quilcapuncu' }, { label: 'Sina' }] },
      { label: 'San Román', distritos: [{ label: 'Juliaca' }, { label: 'Cabana' }, { label: 'Cabanillas' }, { label: 'Caracoto' }, { label: 'San Miguel' }] },
      { label: 'Sandia', distritos: [{ label: 'Sandia' }, { label: 'Cuyocuyo' }, { label: 'Limbani' }, { label: 'Patambuco' }, { label: 'Phara' }, { label: 'Quiaca' }, { label: 'San Juan del Oro' }, { label: 'Yanahuaya' }, { label: 'Alto Inambari' }, { label: 'San Pedro de Putina Punco' }] },
      { label: 'Yunguyo', distritos: [{ label: 'Yunguyo' }, { label: 'Anapia' }, { label: 'Copani' }, { label: 'Cuturapi' }, { label: 'Ollaraya' }, { label: 'Tinicachi' }, { label: 'Unicachi' }] },
    ],
  },
  {
    label: 'San Martín',
    provincias: [
      { label: 'Moyobamba', distritos: [{ label: 'Moyobamba' }, { label: 'Calzada' }, { label: 'Habana' }, { label: 'Jepelacio' }, { label: 'Soritor' }, { label: 'Yantalo' }] },
      { label: 'Bellavista', distritos: [{ label: 'Bellavista' }, { label: 'Alto Biavo' }, { label: 'Bajo Biavo' }, { label: 'Huallaga' }, { label: 'San Pablo' }, { label: 'San Rafael' }] },
      { label: 'El Dorado', distritos: [{ label: 'San José de Sisa' }, { label: 'Agua Blanca' }, { label: 'San Martín' }, { label: 'Santa Rosa' }, { label: 'Shatoja' }] },
      { label: 'Huallaga', distritos: [{ label: 'Saposoa' }, { label: 'Alto Saposoa' }, { label: 'El Eslabón' }, { label: 'Piscoyacu' }, { label: 'Sacanche' }, { label: 'Tingo de Saposoa' }] },
      { label: 'Lamas', distritos: [{ label: 'Lamas' }, { label: 'Alonso de Alvarado' }, { label: 'Barranquita' }, { label: 'Caynarachi' }, { label: 'Cuñumbuqui' }, { label: 'Pinto Recodo' }, { label: 'Rumisapa' }, { label: 'San Roque de Cumbaza' }, { label: 'Shanao' }, { label: 'Tabalosos' }, { label: 'Zapatero' }] },
      { label: 'Mariscal Cáceres', distritos: [{ label: 'Juanjuí' }, { label: 'Campanilla' }, { label: 'Huicungo' }, { label: 'Pachiza' }, { label: 'Pajarillo' }] },
      { label: 'Picota', distritos: [{ label: 'Picota' }, { label: 'Buenos Aires' }, { label: 'Caspisapa' }, { label: 'Pilluana' }, { label: 'Pucacaca' }, { label: 'San Cristóbal' }, { label: 'San Hilarión' }, { label: 'Shamboyacu' }, { label: 'Tingo de Ponasa' }, { label: 'Tres Unidos' }] },
      { label: 'Rioja', distritos: [{ label: 'Rioja' }, { label: 'Awajún' }, { label: 'Elías Soplín Vargas' }, { label: 'Nueva Cajamarca' }, { label: 'Pardo Miguel' }, { label: 'Posic' }, { label: 'San Fernando' }, { label: 'Yorongos' }, { label: 'Yuracyacu' }] },
      { label: 'San Martín', distritos: [{ label: 'Tarapoto' }, { label: 'Alberto Leveau' }, { label: 'Cacatachi' }, { label: 'Chazuta' }, { label: 'Chipurana' }, { label: 'El Porvenir' }, { label: 'Huimbayoc' }, { label: 'Juan Guerra' }, { label: 'La Banda de Shilcayo' }, { label: 'Morales' }, { label: 'Papaplaya' }, { label: 'San Antonio' }, { label: 'Sauce' }, { label: 'Shapaja' }] },
      { label: 'Tocache', distritos: [{ label: 'Tocache' }, { label: 'Nuevo Progreso' }, { label: 'Pólvora' }, { label: 'Shunte' }, { label: 'Uchiza' }] },
    ],
  },
  {
    label: 'Tacna',
    provincias: [
      { label: 'Tacna', distritos: [{ label: 'Tacna' }, { label: 'Alto de la Alianza' }, { label: 'Calana' }, { label: 'Ciudad Nueva' }, { label: 'Coronel Gregorio Albarracín Lanchipa' }, { label: 'Inclán' }, { label: 'Pachía' }, { label: 'Palca' }, { label: 'Pocollay' }, { label: 'Sama' }, { label: 'La Yarada-Los Palos' }] },
      { label: 'Candarave', distritos: [{ label: 'Candarave' }, { label: 'Cairani' }, { label: 'Camilaca' }, { label: 'Curibaya' }, { label: 'Huanuara' }, { label: 'Quilahuani' }] },
      { label: 'Jorge Basadre', distritos: [{ label: 'Locumba' }, { label: 'Ilabaya' }, { label: 'Ite' }] },
      { label: 'Tarata', distritos: [{ label: 'Tarata' }, { label: 'Héroes Albarracín' }, { label: 'Estique' }, { label: 'Estique-Pampa' }, { label: 'Sitajara' }, { label: 'Susapaya' }, { label: 'Tarucachi' }, { label: 'Ticaco' }] },
    ],
  },
  {
    label: 'Tumbes',
    provincias: [
      { label: 'Tumbes', distritos: [{ label: 'Tumbes' }, { label: 'Corrales' }, { label: 'La Cruz' }, { label: 'Pampas de Hospital' }, { label: 'San Jacinto' }, { label: 'San Juan de la Virgen' }] },
      { label: 'Contralmirante Villar', distritos: [{ label: 'Zorritos' }, { label: 'Casitas' }, { label: 'Canoas de Punta Sal' }] },
      { label: 'Zarumilla', distritos: [{ label: 'Zarumilla' }, { label: 'Aguas Verdes' }, { label: 'Matapalo' }, { label: 'Papayal' }] },
    ],
  },
  {
    label: 'Ucayali',
    provincias: [
      { label: 'Coronel Portillo', distritos: [{ label: 'Callería' }, { label: 'Campoverde' }, { label: 'Iparía' }, { label: 'Masisea' }, { label: 'Yarinacocha' }, { label: 'Nueva Requena' }, { label: 'Manantay' }] },
      { label: 'Atalaya', distritos: [{ label: 'Raymondi' }, { label: 'Sepahua' }, { label: 'Tahuanía' }, { label: 'Yurúa' }] },
      { label: 'Padre Abad', distritos: [{ label: 'Padre Abad' }, { label: 'Irazola' }, { label: 'Curimaná' }, { label: 'Neshuya' }, { label: 'Alexander Von Humboldt' }] },
      { label: 'Purús', distritos: [{ label: 'Purús' }] },
    ],
  },
];

/** Helper: busca un departamento por label (case-insensitive, ignora tildes) */
function normalize(str: string): string {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

export function findDepartamento(label: string): Departamento | undefined {
  const n = normalize(label);
  return PERU_LOCATIONS.find(d => normalize(d.label) === n);
}

export function findProvincia(depLabel: string, provLabel: string): Provincia | undefined {
  const dep = findDepartamento(depLabel);
  if (!dep) return undefined;
  const n = normalize(provLabel);
  return dep.provincias.find(p => normalize(p.label) === n);
}

export function findDistrito(depLabel: string, provLabel: string, distLabel: string): Distrito | undefined {
  const prov = findProvincia(depLabel, provLabel);
  if (!prov) return undefined;
  const n = normalize(distLabel);
  return prov.distritos.find(d => normalize(d.label) === n);
}

export function getProvincias(depLabel: string): Provincia[] {
  return findDepartamento(depLabel)?.provincias || [];
}

export function getDistritos(depLabel: string, provLabel: string): Distrito[] {
  return findProvincia(depLabel, provLabel)?.distritos || [];
}
