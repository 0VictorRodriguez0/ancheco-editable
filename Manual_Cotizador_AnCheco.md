# Manual del Cotizador AnCheco

_Documento interno preparado por AInnovation para Andrea Cherro Corallo_
_Fecha: 3 de julio de 2026_

## Introducción

Este documento explica, en lenguaje simple, cómo funciona la cotizadora integrada en su página web de AnCheco. La cotizadora acompaña a los seis productos que actualmente ofrece: Seguro Educativo, Gastos Médicos Mayores, Seguro de Auto, Seguro Mascota, Seguro Patrimonial (Hogar) y Seguro con Ahorro. Para cada uno se describe qué le pregunta al cliente, qué tablas usa por dentro y cómo llega al monto anual que se le muestra al final.

Es importante que tenga presente lo siguiente: las primas que arroja el simulador son estimaciones. Están armadas con base en tablas que reproducen los materiales y los PDFs reales de GNP, y en varios productos están calibradas contra cotizaciones oficiales que usted misma compartió. Sin embargo, la cotización oficial siempre la emite GNP, tomando en cuenta información adicional (cuestionario médico, inspección vehicular, código postal, historial del cliente, etc.). Use este simulador para dar al cliente una idea cercana del precio y para responder sus dudas con seguridad, pero valide siempre el número final en el cotizador oficial de GNP antes de cerrar el contrato.

## Cómo funciona el cotizador (general)

El flujo es el mismo en todos los productos. El cliente entra al sitio y elige el seguro que le interesa. Se abre un asistente que le hace preguntas paso a paso: cuántos años tiene, cuánto quiere proteger, qué plazo prefiere, si quiere agregar coberturas extras. Con cada respuesta, el sistema aplica las tablas y los ajustes correspondientes y en tiempo real recalcula la prima anual estimada. Al final, el cliente ve un resumen con el monto que pagaría al año y el detalle de lo que cubre.

Del lado suyo, el sistema tiene una sección editable donde puede ajustar las tablas, los porcentajes y las primas base. Si GNP actualiza precios, si cambian los factores de riesgo, o si usted detecta que el simulador se está desviando del cotizador oficial, puede corregir los valores directamente desde el panel de administración y los cambios se reflejan al instante en la cotizadora pública. No hace falta pedir ayuda técnica para eso.

## 1. Seguro Educativo

### 1.1 Qué es este seguro

Es un plan de ahorro con seguro de vida pensado para asegurar la carrera universitaria de un hijo o hija. El papá o mamá (contratante) paga primas anuales durante el plazo que elija, y cuando el menor cumple aproximadamente 18 años recibe un monto garantizado para pagar la universidad. Además, si el contratante fallece, sufre incapacidad total o enfermedad terminal antes del vencimiento, el seguro paga anticipos importantes para que el plan se complete de todas formas.

### 1.2 Qué le pregunta la cotizadora al cliente

La cotizadora hace cuatro preguntas:

- ¿Cuántos años tiene el contratante? (papá o mamá que paga el seguro, de 18 a 70 años)
- ¿Cuántos años tiene el menor beneficiario? (hijo o hija, de 0 a 17 años)
- ¿Qué monto de protección garantizada quiere para el menor? Se elige entre opciones fijas, por ejemplo $500,000, $1,000,000 o $2,000,000.
- ¿En cuántos años quiere terminar de pagar? Tres opciones: 5 años, 10 años o hasta que el menor cumpla 18 años (edad alcanzada).

### 1.3 Constantes y tablas que usa

| Concepto | Valor | Para qué sirve |
|---|---|---|
| Protección de referencia | $1,100,000 | Monto contra el que se compara lo que elija el cliente |
| Edad del contratante de referencia | 37 años | Edad base contra la que se compara la edad real del contratante |
| Factor por año de edad | 4% | Cuánto sube o baja la prima por cada año de diferencia con la edad de referencia |
| Prima base plazo 5 años | $82,670 al año | Prima base si paga en 5 años |
| Prima base plazo 10 años | $43,735 al año | Prima base si paga en 10 años |
| Prima base hasta edad alcanzada | $25,760 al año | Prima base si paga hasta que el menor cumpla 18 |
| Anticipo por incapacidad total | $2,000,000 | Cobertura fija incluida |
| Anticipo por enfermedad terminal | $600,000 más gastos funerarios | Cobertura fija incluida |

### 1.4 Cómo se calcula la prima paso a paso

1. Se calcula el ajuste por edad del contratante. La referencia es 37 años. Por cada año arriba o abajo de esa edad, la prima sube o baja un 4%. Ejemplo: 40 años son 3 años más, el ajuste queda en 1.12 (12% más). Con 30 años son 7 años menos, el ajuste queda en 0.72 (28% menos).
2. Se calcula el ajuste por monto de protección. Se divide el monto que eligió el cliente entre $1,100,000. Si eligió $1,000,000, el ajuste es 0.9091.
3. Se multiplican los dos ajustes anteriores. Ese resultado es el factor combinado.
4. Se toma la prima base según el plazo elegido: $82,670 (5 años), $43,735 (10 años) o $25,760 (hasta edad alcanzada).
5. Se multiplica la prima base por el factor combinado. Se redondea al peso más cercano y ese es el monto anual que se muestra al cliente.

### 1.5 Ejemplo numérico completo

Un papá de 40 años quiere contratar el plan educativo para su hijo de 5 años. Elige una protección garantizada de $1,000,000 y quiere pagar en 10 años.

- Ajuste por edad: 40 años son 3 más que los 37 de referencia. Factor: 1 + (3 × 0.04) = 1.12.
- Ajuste por monto: $1,000,000 ÷ $1,100,000 = 0.9091.
- Factor combinado: 1.12 × 0.9091 = 1.0182.
- Prima base 10 años: $43,735.
- Prima anual final: $43,735 × 1.0182 = $44,530 aproximadamente.

Resultado: el cliente pagaría alrededor de $44,530 al año durante 10 años. El menor recibe $1,000,000 alrededor de sus 18 años. Incluye anticipo de $2,000,000 por incapacidad total y $600,000 más gastos funerarios por enfermedad terminal.

### 1.6 Notas y aclaraciones

Este producto está calibrado con constantes redondas, no contra un PDF de cotización oficial de GNP como sí ocurre con Gastos Médicos Mayores y Auto. Es un modelo simplificado que da una idea cercana del monto, no el número exacto del cotizador oficial.

Al cotizar en GNP la cifra real puede variar por factores que el simulador no toma en cuenta: sexo del titular, si fuma, historial médico, coberturas adicionales del plan Profesional y ajustes actuariales por año calendario. La edad del menor no afecta la prima anual en la fórmula actual; solo se usa para mostrar cuántos años faltan para los 18. El monto que ve el hijo al cumplir 18 años es exactamente igual a la protección garantizada elegida, sin descuentos ni rendimientos ocultos.

Todas las constantes pueden editarse desde el panel de administración, en la sección "Constantes de cálculo".

## 2. Gastos Médicos Mayores (GMM)

### 2.1 Qué es este seguro

Cubre padecimientos grandes: hospitalizaciones, cirugías y enfermedades graves cuya factura supera al deducible. El simulador entrega una pre-cotización anual del plan Personaliza Variable de GNP, calibrada directamente contra los PDFs reales que usted compartió. No cubre consultas preventivas ni medicina del día a día.

### 2.2 Qué le pregunta la cotizadora al cliente

- ¿Para quién es el seguro? Individual, pareja o familia.
- Edad del titular (de 18 a 75 años).
- Sexo del titular (hombre o mujer).
- Si es pareja o familia, edad del cónyuge; si es familia, cuántos hijos (de 1 a 4) y edad promedio de los hijos.
- ¿Fuma el titular? (sí o no)
- Nivel hospitalario: A Premium, B Alta (Preferente), C Media o D Esencial.
- Deducible (diez opciones que cambian según el nivel hospitalario).
- Suma asegurada: $2.2M Básica, $17.5M Intermedia, $40.8M Personaliza estándar o $58.3M Mayor cobertura.
- Coberturas adicionales opcionales: Cobertura Dental y Auditiva, Maternidad, Ayuda para Recuperación.

### 2.3 Constantes y tablas que usa

Tabla de prima base por edad del titular (configuración de referencia: Nivel B, suma $40.8M, deducible medio):

| Edad de referencia | Prima neta anual |
|---|---|
| 25 años | $14,633 |
| 35 años | $21,282 |
| 50 años | $31,837 |
| 65 años | $86,671 |

Para edades intermedias el simulador interpola en línea recta entre el ancla anterior y la siguiente.

Ajustes que se aplican encima:

| Concepto | Valor | Aplica cuando |
|---|---|---|
| Factor mujer | 1.19 | Titular mujer menor de 55 años |
| Factor fumador | 1.20 | Titular declara que fuma (solo al titular) |
| Nivel A Premium | 1.28 | Multiplicador del nivel hospitalario |
| Nivel B Preferente | 1.00 (referencia) | Multiplicador del nivel hospitalario |
| Nivel C Media | 0.85 | Multiplicador del nivel hospitalario |
| Nivel D Esencial | 0.85 | Multiplicador del nivel hospitalario |
| Escalón por deducible | 0.955 | Por cada opción arriba de la referencia (opción 3) |
| Suma $2.2M | 0.42 | Multiplicador por suma asegurada |
| Suma $17.5M | 0.82 | Multiplicador por suma asegurada |
| Suma $40.8M | 1.00 (referencia) | Multiplicador por suma asegurada |
| Suma $58.3M | 1.12 | Multiplicador por suma asegurada |
| Cobertura Dental y Auditiva | $1,800 al año | Cobertura opcional |
| Maternidad | $5,200 al año | Cobertura opcional |
| Ayuda para Recuperación | $2,800 al año | Cobertura opcional |
| Derecho de póliza | $970 por asegurado | Cargo administrativo fijo |
| IVA | 16% | Impuesto sobre prima neta más derecho de póliza |

Ajustes por hijos: base de $11,400 por hijo, ajustada por edad promedio (menor de 10 × 0.75, de 10 a 17 × 0.92, 18 o más × 1.05) y por cantidad (1 hijo × 1.0, 2 hijos × 2.0, 3 hijos × 2.9, 4 o más × 3.7).

### 2.4 Cómo se calcula la prima paso a paso

1. Prima base del titular: se toma la tabla de anclas (25, 35, 50, 65 años) y se calcula la prima que corresponde a la edad exacta interpolando en línea recta entre los dos puntos más cercanos.
2. Ajuste por sexo: si el titular es mujer menor de 55 años, se multiplica por 1.19.
3. Ajuste por fumador: si el titular fuma, se multiplica por 1.20. Solo aplica al titular.
4. Cónyuge (si aplica): se calcula la prima con su edad y sexo (opuesto al del titular) usando el mismo procedimiento y se suma. No lleva factor fumador.
5. Hijos (si aplica): se toma la base $11,400, se ajusta por la edad promedio y por la cantidad, y se suma.
6. Nivel hospitalario: la suma acumulada se multiplica por el multiplicador del nivel elegido.
7. Deducible: se ubica en cuál de las diez opciones cayó el cliente y se multiplica por 0.955 elevado a la diferencia entre la opción elegida y la opción de referencia (opción 3). Deducible más alto que la referencia = prima más baja.
8. Suma asegurada: se multiplica por el multiplicador de la suma elegida.
9. Coberturas adicionales: se suman los montos fijos anuales que el cliente haya activado.
10. Derecho de póliza: se suma $970 por cada asegurado incluido.
11. IVA: al total anterior se le agrega 16%. Ese es el monto anual final que se muestra al cliente.

### 2.5 Ejemplo numérico completo

Hombre de 40 años, no fumador, individual, Nivel B Preferente, deducible medio (opción 3, que es la referencia), suma asegurada $40.8M, sin coberturas adicionales.

- Prima base por edad 40 (interpolando entre 35 y 50): 21,282 + (5 ÷ 15) × (31,837 − 21,282) = 21,282 + 3,518 = $24,800.
- Ajuste por sexo: es hombre, sin cambio. Sigue en $24,800.
- Ajuste por fumador: no fuma, sin cambio. Sigue en $24,800.
- Cónyuge e hijos: no aplican.
- Nivel B: multiplicador 1.00. Sigue en $24,800.
- Deducible opción 3 (referencia): 0.955 elevado a 0 = 1.00. Sigue en $24,800.
- Suma $40.8M (referencia): multiplicador 1.00. Prima neta = $24,800.
- Coberturas adicionales: ninguna. Sigue en $24,800.
- Derecho de póliza: $970 × 1 asegurado. Subtotal antes de IVA = $25,770.
- IVA 16%: $25,770 × 1.16 = $29,893.

Resultado: prima anual total con IVA aproximada de $29,893.

### 2.6 Notas y aclaraciones

Este producto está calibrado directamente contra los PDFs reales de GNP que usted compartió (póliza familiar 697309037 y material del 19 de mayo). Los cuatro puntos de la tabla de edad y los factores de mujer y fumador reproducen las primas netas reales.

La curva real de GNP es exponencial después de los 40 años, pero con solo cuatro anclas y línea recta entre ellas el simulador puede quedar unos pesos por debajo o por arriba de la tarifa oficial para edades entre 40 y 50. En las edades exactamente iguales a los anclas (25, 35, 50, 65), el número es casi idéntico al PDF.

Es una pre-cotización informativa. La prima final la emite GNP después del cuestionario médico, revisión de riesgos y verificación de preexistencias. Recuerde que las preexistencias como diabetes o hipertensión hay que declararlas y GNP las cubre después de 6 meses a 2 años, o después de 5 años sin tratamiento (cobertura entre $500,000 y $1,000,000). El simulador no ajusta por esto.

El factor mujer solo aplica hasta los 54 años. A partir de los 55, hombre y mujer pagan igual. El factor fumador solo se aplica al titular. Los hijos se cotizan como paquete con un factor de cantidad, no uno por uno; si las edades entre hijos son muy diferentes, el promedio puede subestimar o sobrestimar. En familias de 4 o más, GNP a veces arma póliza familiar compartida con un solo deducible, mecánica que el simulador no reproduce.

## 3. Seguro de Auto

### 3.1 Qué es este seguro

Cubre el auto del cliente, desde daños a terceros (Responsabilidad Civil) hasta robo total y daños materiales al propio vehículo. El simulador estima cuánto pagará al año dependiendo del auto, cómo lo usa, qué tipo de cobertura elige y qué tan grande es el deducible que está dispuesto a asumir en caso de siniestro.

### 3.2 Qué le pregunta la cotizadora al cliente

- ¿Qué marca y modelo tiene el auto? (Nissan Sentra, Toyota Corolla, Honda Civic, etc.)
- ¿De qué año es? (del 2005 al 2026)
- ¿Cuál es el valor del auto en pesos? (con un deslizador)
- ¿Qué uso le da? Particular o comercial (Uber, DiDi, repartos, taxi).
- ¿Qué tipo de cobertura quiere? RC, Limitada, Amplia o Amplia Total.
- Si la cobertura no es RC, deducible por robo total: 5%, 10% o 15%.
- Si la cobertura no es RC, deducible por daños materiales: 3%, 5% o 10%.
- ¿Quiere agregar coberturas extras opcionales? Auto sustituto, Llantas y rines, Llave de repuesto.

### 3.3 Constantes y tablas que usa

| Concepto | Valor | Para qué sirve |
|---|---|---|
| Tasa base | 5% del valor del auto | Punto de partida (referencia: Amplia particular seminuevo) |
| Valor por defecto | $400,000 | Se usa si el cliente no captura el valor |
| Antigüedad 0 a 4 años | 1.00 | Multiplicador por antigüedad del auto |
| Antigüedad 5 a 7 años | 1.08 | Multiplicador por antigüedad |
| Antigüedad 8 años o más | 1.18 | Multiplicador por antigüedad |
| Uso particular | 1.00 | Multiplicador por tipo de uso |
| Uso comercial | 1.30 | Multiplicador por tipo de uso |
| Cobertura RC | 0.35 | Multiplicador por cobertura |
| Cobertura Limitada | 0.65 | Multiplicador por cobertura |
| Cobertura Amplia | 1.00 (referencia) | Multiplicador por cobertura |
| Cobertura Amplia Total | 1.176 | Multiplicador por cobertura |
| Deducible robo 5% | 1.15 | Multiplicador por deducible de robo |
| Deducible robo 10% | 1.00 | Multiplicador por deducible de robo |
| Deducible robo 15% | 0.90 | Multiplicador por deducible de robo |
| Deducible daños 3% | 1.15 | Multiplicador por deducible de daños |
| Deducible daños 5% | 1.00 | Multiplicador por deducible de daños |
| Deducible daños 10% | 0.88 | Multiplicador por deducible de daños |
| Auto sustituto | $960 al año | Cobertura extra opcional |
| Llantas y rines | $1,511 al año | Cobertura extra opcional |
| Llave de repuesto | $621 al año | Cobertura extra opcional |

### 3.4 Cómo se calcula la prima paso a paso

1. Se toma el valor del vehículo declarado (o $400,000 si no lo captura).
2. Se calcula la prima base como el 5% del valor del auto.
3. Se ajusta por antigüedad. Si tiene menos de 5 años, no cambia; entre 5 y 7 años sube 8%; con 8 años o más sube 18%.
4. Se ajusta por uso. Particular no cambia; comercial sube 30%.
5. Se ajusta por cobertura. RC paga 35%, Limitada 65%, Amplia 100%, Amplia Total 117.6% de la base ajustada.
6. Se ajusta por deducible de robo, si la cobertura no es RC. 5% sube 15%, 10% queda igual, 15% baja 10%.
7. Se ajusta por deducible de daños, si la cobertura no es RC. 3% sube 15%, 5% queda igual, 10% baja 12%.
8. Se suman las coberturas extras seleccionadas: Auto sustituto $960, Llantas $1,511, Llave $621.
9. El resultado se redondea y se muestra como prima anual estimada.

### 3.5 Ejemplo numérico completo

Cliente con un Honda Civic 2020 valuado en $300,000, uso particular, cobertura Amplia con deducible del 10% por robo y 5% por daños materiales, sin coberturas extras.

- Valor: $300,000.
- Prima base: $300,000 × 0.05 = $15,000.
- Antigüedad: el auto es 2020, en 2026 tiene 6 años, cae en 5 a 7 años. $15,000 × 1.08 = $16,200.
- Uso particular: × 1.00. Sigue en $16,200.
- Cobertura Amplia: × 1.00. Sigue en $16,200.
- Deducible robo 10%: × 1.00. Sigue en $16,200.
- Deducible daños 5%: × 1.00. Sigue en $16,200.
- Coberturas extras: $0.
- Prima anual final: $16,200 aproximadamente.

Como referencia, con la misma configuración pero cobertura RC bajaría a $5,670 y con Amplia Total subiría a $19,051.

### 3.6 Notas y aclaraciones

Este producto está calibrado contra un PDF real de GNP que usted compartió: un Mazda CX-5 2015 con valor $178,000, conductor de 51 años en Cancún, cobertura Amplia, que arrojó $10,318 al año en la póliza real. El simulador da un número muy cercano. Amplia Total en ese mismo PDF salió $12,130, con un incremento del 17.6%, que es exactamente el multiplicador que usa el simulador (1.176).

El simulador no pregunta la edad del conductor, aunque en la vida real GNP sí la considera. Va a necesitar ajustar manualmente en el cotizador oficial si el conductor es muy joven (menos de 25) o muy mayor (más de 65), porque la prima puede subir entre 20% y 30% en esos casos. Tampoco pregunta el código postal, y GNP sí lo usa: Cancún y CDMX suelen ser más caras que ciudades pequeñas.

Las coberturas Deducible Cero y Siempre en Agencia aparecen como opciones pero todavía no suman al total; están pendientes de que usted confirme el costo real. La recomendación general es: si el auto vale más de $150,000, cobertura Amplia; si vale menos o es del 2006 o más viejo, tiene sentido considerar RC. Los deducibles 10% robo y 5% daños son el balance sugerido por default.

## 4. Seguro Mascota

### 4.1 Qué es este seguro

Es un seguro anual para perros y gatos entre 3 meses y 9 años que cubre gastos médicos veterinarios por accidente o enfermedad (cirugías, hospitalización, análisis), incluye responsabilidad civil por si el perro muerde a alguien, orientación veterinaria 24/7 y servicio de cremación. En el simulador el cliente elige uno de tres paquetes ya armados, y la prima se ajusta según la especie y la edad del animal.

### 4.2 Qué le pregunta la cotizadora al cliente

- ¿Es perro o gato?
- ¿Cuántos años tiene? (de 0 a 9 años, mínimo 3 meses)
- ¿Qué paquete quiere? Cuidado Máximo, Cuidado Superior o Cuidado Esencial.
- ¿Quiere agregar extras opcionales? Fallecimiento, Robo con violencia, RC mascota ampliada.

### 4.3 Constantes y tablas que usa

| Concepto | Valor | Para qué sirve |
|---|---|---|
| Prima base Cuidado Esencial | $2,050 al año | Arranque del paquete chico (perro 3 años) |
| Prima base Cuidado Superior | $3,650 al año | Arranque del paquete intermedio (perro 3 años) |
| Prima base Cuidado Máximo | $4,490 al año | Arranque del paquete completo (perro 3 años) |
| Suma asegurada Esencial | $10,000 | Cobertura médica del paquete |
| Suma asegurada Superior | $20,000 | Cobertura médica del paquete |
| Suma asegurada Máximo | $30,000 | Cobertura médica del paquete |
| Factor perro | 1.10 | Multiplicador por especie perro |
| Factor gato | 1.00 | Multiplicador por especie gato |
| Ajuste por edad | 6% por año arriba de 3 años | Los primeros 3 años no ajustan |
| Extra Fallecimiento | $720 al año | Indemnización si la mascota fallece |
| Extra Robo con violencia | $480 al año | Indemnización si roban a la mascota |
| Extra RC ampliada | $540 al año | Cobertura ampliada de daños a terceros |

### 4.4 Cómo se calcula la prima paso a paso

1. Se toma la prima base del paquete elegido (Esencial $2,050, Superior $3,650 o Máximo $4,490).
2. Se ajusta por edad. Si la mascota tiene 3 años o menos, no cambia. Si tiene más de 3, se suma 6% por cada año extra.
3. Se ajusta por especie. Gato no cambia. Perro se multiplica por 1.10.
4. Se suman los extras opcionales que el cliente haya activado: Fallecimiento $720, Robo $480, RC ampliada $540.
5. Se redondea al peso más cercano y ese es el monto anual final.

### 4.5 Ejemplo numérico completo

Perro mestizo macho de 5 años. El cliente escoge Cuidado Máximo y agrega el extra de RC ampliada porque su perro es de raza mediana-grande.

- Prima base Máximo: $4,490.
- Ajuste por edad: 2 años arriba de 3, recargo 12%. $4,490 × 1.12 = $5,028.80.
- Ajuste por especie perro: $5,028.80 × 1.10 = $5,531.68.
- Extra RC ampliada: + $540. Total: $6,071.68.
- Redondeo: $6,072.

Resultado: $6,072 al año con RC ampliada. Sin el extra sería $5,532 al año, que es exactamente el número del PDF real de GNP contra el que está calibrado el simulador.

### 4.6 Notas y aclaraciones

Este producto sí está calibrado contra un PDF real de GNP: la cotización folio MVD26060673421 (perro mestizo macho 5 años, junio 2026), que arroja Esencial $2,525, Superior $4,495 y Máximo $5,532. De ahí se despejaron hacia atrás las bases para perro de 3 años.

El cliente no elige la suma asegurada libremente como en Auto o GMM: la suma viene atada al paquete. El simulador no pregunta la raza específica del perro. El PDF real sí distingue razas peligrosas (Pitbull, Rottweiler y otras) con condiciones especiales, así que debe validar la raza al cotizar en GNP; si es raza peligrosa, la prima real puede ser mayor o requerir suscripción especial. Tampoco se pregunta el tamaño ni el sexo; en GNP real sí se piden pero impactan poco en el precio final.

Los extras se suman como monto fijo, no como porcentaje. Recuerde comunicar los tiempos de espera: 10 días para accidentes, 180 días para enfermedades y 360 días para el extra de Fallecimiento. El paquete recomendado por default es Cuidado Máximo, porque la diferencia de precio con Superior no es enorme y la suma asegurada sube bastante.

## 5. Seguro Patrimonial / Hogar

### 5.1 Qué es este seguro

Protege la casa del cliente (la estructura del inmueble) y todo lo que hay dentro (muebles, ropa, electrodomésticos, electrónicos) contra incendio, robo con violencia, fenómenos naturales, explosiones y daños eléctricos. En el simulador se llama "Casa / Patrimonial" y arma la prima a partir de dos números principales: cuánto vale la casa y cuánto valen sus contenidos.

### 5.2 Qué le pregunta la cotizadora al cliente

- ¿Cuánto vale su casa? (valor de reconstrucción, sin contar el terreno, de $500,000 a $10,000,000)
- ¿Cuánto valen los contenidos? (muebles, ropa, electrodomésticos, de $50,000 a $2,000,000)
- ¿Quiere agregar coberturas adicionales? Hidrometeorológicos (huracán, inundación, granizo), Terremoto y Erupción Volcánica, Servicio Funerario para Mascotas.

### 5.3 Constantes y tablas que usa

| Concepto | Valor | Para qué sirve |
|---|---|---|
| Umbral para elegir paquete | $3,000,000 | Si la casa vale hasta este monto, se elige VITAL; si vale más, A TU MEDIDA |
| Tarifa casa VITAL | 0.095% del valor de la casa | Costo de asegurar la estructura |
| Tarifa contenidos VITAL | 0.220% del valor de contenidos | Costo de asegurar los contenidos |
| Cargo fijo VITAL | $0 | El paquete VITAL no lleva cargo fijo |
| Tarifa casa A TU MEDIDA | 0.098% del valor de la casa | Un poco más caro por incluir coberturas premium |
| Tarifa contenidos A TU MEDIDA | 0.220% del valor de contenidos | Igual que VITAL |
| Cargo fijo A TU MEDIDA | $5,978 al año | Cubre RC $3M, teletrabajo, funeraria mascotas, entre otros |
| Factor Hidrometeorológicos | 75% de la prima base | Costo del addon contra huracán e inundación |
| Costo Terremoto | Según código postal | No lo calcula el simulador; se cotiza aparte en GNP |
| Servicio Funerario Mascotas | $348 al año | Costo fijo del addon opcional |

### 5.4 Cómo se calcula la prima paso a paso

1. Se toma el valor de la casa y el valor de los contenidos declarados por el cliente.
2. Se compara el valor de la casa con el umbral de $3,000,000. Si es igual o menor, el paquete es VITAL; si es mayor, es A TU MEDIDA. El cliente no elige; lo elige la calculadora.
3. Se calcula la parte de la casa: valor de la casa multiplicado por la tarifa del paquete (0.095% en VITAL o 0.098% en A TU MEDIDA).
4. Se calcula la parte de los contenidos: valor de contenidos multiplicado por 0.220%.
5. Se suman ambos y se agrega el cargo fijo del paquete (0 en VITAL, $5,978 en A TU MEDIDA). Ese total es la prima base anual.
6. Si el cliente activa Hidrometeorológicos, se calcula el 75% de la prima base y se suma.
7. Si el cliente activa Servicio Funerario Mascotas, se suman $348 fijos.
8. Si activa Terremoto, no se agrega monto en el simulador: queda marcado como "Según CP" para cotización aparte.
9. El resultado es la prima anual estimada.

### 5.5 Ejemplo numérico completo

Familia con casa propia en Cancún. Valor de reconstrucción: $2,500,000. Contenidos: $500,000. Quieren agregar la protección contra huracanes por vivir en zona costera.

- Valor casa $2,500,000, contenidos $500,000.
- Como $2,500,000 no supera los $3,000,000, se elige paquete VITAL.
- Parte de la casa: $2,500,000 × 0.00095 = $2,375.
- Parte de los contenidos: $500,000 × 0.00220 = $1,100.
- Prima base: $2,375 + $1,100 + $0 = $3,475 al año.
- Hidrometeorológicos: $3,475 × 0.75 = $2,606.
- No activa funeraria mascotas ni terremoto.
- Total anual: $3,475 + $2,606 = $6,081.

Resultado: aproximadamente $6,081 al año, con la cobertura de huracanes incluida.

### 5.6 Notas y aclaraciones

Este producto es el más simplificado de los seis. Solo hace dos preguntas duras (valor de casa y valor de contenidos) y luego los tres addons opcionales. No pregunta código postal, materiales, número de pisos ni antigüedad del inmueble, aunque GNP sí toma en cuenta esos datos en la póliza real.

El paquete VITAL o A TU MEDIDA se elige automáticamente por el valor de la casa. Usted no puede elegir manualmente el paquete desde la calculadora; para presentar al cliente el paquete PLUS o combinar coberturas específicas, tendrá que cotizar en GNP directo.

Este producto no está calibrado contra un PDF de cotización real de GNP entregado por usted (a diferencia de GMM y Auto, que sí lo están). Los porcentajes de tarifa son valores base coherentes con el mercado, pero pueden diferir de lo que arroje el emisor oficial de GNP en un rango del 10% al 20%.

La cobertura Terremoto sale como "Según código postal" porque GNP la cobra según zona sísmica del inmueble; hay que cotizarla manualmente y sumarla al total. El factor Hidrometeorológicos del 75% es alto pero realista para zonas costeras como Cancún; en zonas del interior con bajo riesgo puede ser más barato.

Los rangos de las barras son: casa de $500,000 a $10,000,000, contenidos de $50,000 a $2,000,000. Si el cliente tiene una casa fuera de ese rango, cotice directo en GNP.

## 6. Seguro con Ahorro

### 6.1 Qué es este seguro

Es un plan personal de retiro y ahorro de GNP con cuatro versiones distintas (TRASCIENDE, CAPITALIZA, CONSOLIDA y PROYECTA), cada una pensada para un objetivo diferente. Todos incluyen seguro de vida desde el primer día, sin cargo adicional visible. El cliente aporta cada año durante el plazo que elija, y su dinero crece con interés compuesto hasta el retiro.

### 6.2 Qué le pregunta la cotizadora al cliente

- ¿Cuál de los cuatro productos quiere? TRASCIENDE (flexible, con herencia vitalicia), CAPITALIZA (inversión con 14 portafolios), CONSOLIDA (deducible de impuestos) o PROYECTA (rígido para retiro).
- ¿Cuántos años tiene? (de 0 a 60 años)
- ¿Cuánto puede aportar al año? (de $12,000 a $240,000, en incrementos de $6,000)
- ¿Durante cuántos años quiere aportar? PROYECTA solo permite 10 años; TRASCIENDE permite 5, 10 o 15; CAPITALIZA y CONSOLIDA permiten 10 o 15.

### 6.3 Constantes y tablas que usa

| Concepto | Valor | Para qué sirve |
|---|---|---|
| Indexación anual de la aportación | 5% cada año | La aportación sube 5% automáticamente para compensar la inflación |
| Edad de retiro proyectado principal | 65 años | Edad de referencia para mostrar el saldo acumulado |
| Edad de retiro proyectado alternativo | 70 años | Escenario alternativo si deja el dinero cinco años más |
| Rango de aportación anual | $12,000 a $240,000 | Equivale a entre $1,000 y $20,000 al mes |
| Rango de edad del cliente | 0 a 60 años | Edad mínima y máxima aceptada |

Multiplicadores para proyectar el saldo, calibrados contra tres casos reales del material oficial de GNP:

| Caso de referencia | Multiplicador a los 65 | Multiplicador a los 70 |
|---|---|---|
| Carola, 5 años | 453.13 | 647.22 |
| Sofía, 18 años | 217.71 | 313.55 |
| Elia, 43 años | 43.45 | 67.47 |

Para edades intermedias el sistema interpola entre esos tres puntos.

Seguro de vida incluido desde el día 1 (multiplicadores sobre la aportación anual):

| Tramo de edad | TRASCIENDE | CAPITALIZA | CONSOLIDA / PROYECTA |
|---|---|---|---|
| Hasta 10 años | 80 veces | 30 veces | 25 veces |
| 11 a 20 años | 25 veces | 12 veces | 10 veces |
| 21 a 25 años | 12 veces | 12 veces | 10 veces |
| 26 a 35 años | 12 veces | 7 veces | 6 veces |
| 36 a 40 años | 6 veces | 7 veces | 6 veces |
| Más de 40 años | 6 veces | 5.5 veces | 4.5 veces |

### 6.4 Cómo se calcula la prima paso a paso

1. El cliente elige el producto, su edad, la aportación anual y el plazo de aportación.
2. La "prima" no es un cargo por seguro: es exactamente la aportación anual elegida.
3. Se calcula el total aportado a lo largo del plazo, considerando que la aportación se indexa 5% cada año. Por eso el total es un poco mayor que aportación multiplicada por años.
4. Se calcula el saldo proyectado a los 65 años. Se usa el multiplicador correspondiente a la edad del cliente, interpolando entre los tres casos de referencia. Entre más joven inicia, mayor el multiplicador porque hay más años para que el interés compuesto trabaje.
5. Se calcula el saldo proyectado a los 70 años con el multiplicador equivalente.
6. Si el plazo no es 10 años, el sistema resuelve internamente la tasa de rendimiento equivalente al caso real y la aplica al plazo elegido.
7. Se calcula el seguro de vida desde el día 1: aportación anual multiplicada por el factor correspondiente al producto y al tramo de edad.
8. La pantalla final muestra: aportación anual, total aportado en el plazo, suma asegurada de vida, saldo proyectado a 65 años, porcentaje de recuperación sobre lo aportado y saldo proyectado a 70 años.

### 6.5 Ejemplo numérico completo

Sofía, mujer de 18 años, quiere empezar a ahorrar para su retiro con el producto TRASCIENDE. Elige aportar $36,000 al año durante 10 años.

- Producto: TRASCIENDE. Edad: 18. Aportación anual: $36,000. Plazo: 10 años.
- Total aportado a lo largo de los 10 años, indexado 5% cada año: aproximadamente $453,000.
- Saldo proyectado a los 65 años: $36,000 × 217.71 = $7,837,560, libres de impuestos.
- Saldo proyectado a los 70 años: $36,000 × 313.55 = $11,287,800.
- Seguro de vida desde el día 1: como Sofía tiene 18 años, entra en el tramo de 11 a 20 de TRASCIENDE, con multiplicador 25. Cálculo: $36,000 × 25 = $900,000 de suma asegurada vitalicia.

Resultado: Sofía pagaría $36,000 al año durante 10 años (con incremento anual del 5%), aportará en total alrededor de $453,000, a los 65 años recibirá aproximadamente $7.8 millones libres de impuestos, y desde el primer día tiene un seguro de vida de $900,000.

### 6.6 Notas y aclaraciones

La "prima anual" en este producto no es un cargo por seguro como en GMM o Auto: es exactamente la aportación que el cliente decidió hacer. El seguro de vida y la protección vienen incluidos dentro del mismo producto, sin cargo adicional visible.

Los multiplicadores para proyectar el saldo a 65 y 70 años están calibrados contra tres casos reales del material oficial "Ahorro Inteligente 2026" de GNP (Carola de 5 años, Sofía de 18 años y Elia de 43 años). Para cualquier otra edad, el sistema interpola entre esos casos. Los resultados son muy cercanos a lo que aparece en el material oficial para el plazo estándar de 10 años.

La aportación anual se indexa 5% cada año, tal como lo hace GNP en sus planes reales, para proteger al cliente contra la inflación. Puede modificar esta tasa desde el panel si GNP la actualiza. La suma asegurada de vida también está calibrada contra los casos reales y puede ajustarse por tramo desde el panel de constantes.

PROYECTA solo permite plazo de 10 años en el simulador, aunque el producto de GNP también acepta 15. Si un cliente quiere PROYECTA a 15 años, ajuste manualmente al cotizar en GNP. En edades extremas (menores de 5 años o mayores de 43) los números pueden desviarse un poco de una cotización oficial, así que valide el saldo proyectado antes de comprometerlo con el cliente.

## Preguntas frecuentes

### ¿Por qué el simulador no me da lo mismo que GNP?

El simulador es una herramienta de estimación. En productos como Gastos Médicos Mayores, Auto y Mascota está calibrado contra PDFs reales de GNP que usted compartió, así que los números son muy cercanos. En Educativo, Hogar y Ahorro son aproximaciones basadas en tablas y materiales oficiales, pero no en una cotización individual. Además, GNP toma en cuenta información que el simulador no pregunta: cuestionario médico, inspección vehicular, código postal, historial del cliente, ajustes actuariales por año. Use el simulador para dar una idea al cliente y valide siempre el número final en el cotizador oficial.

### ¿Puedo cambiar un precio o una tabla?

Sí. Todas las constantes (primas base, factores, multiplicadores, coberturas opcionales) se pueden editar desde el panel de administración en la sección "Constantes de cálculo". Los cambios se reflejan al instante en la cotizadora pública, sin necesidad de ayuda técnica. Si GNP actualiza precios o si detecta desviaciones con el cotizador oficial, ajuste los valores directamente.

### ¿Qué pasa si el cliente pide un descuento?

El simulador no aplica descuentos automáticos ni comisiones. Muestra la prima estimada al valor de tabla. Si el cliente pide un descuento o si usted quiere aplicar una promoción, hágalo directamente al cotizar en GNP o al presentar la propuesta final. La cotizadora sirve como referencia; el cierre lo maneja usted con las condiciones comerciales que corresponda.

### ¿Cuándo debo actualizar las tablas?

Actualice las tablas cuando GNP publique un cambio de tarifas (normalmente una vez al año, en enero o febrero), cuando detecte que el número del simulador difiere consistentemente del cotizador oficial en más de 10%, o cuando reciba nuevos PDFs de cotización oficial que sirvan para recalibrar. También conviene revisar las constantes cada seis meses aunque no haya cambios, para confirmar que siguen alineadas con la realidad del mercado.

## Cierre

Este manual está pensado para que usted entienda cómo llega el simulador a cada número y pueda explicarlo con seguridad al cliente. Todas las constantes son editables desde el panel de administración; ante cualquier duda técnica o si necesita ajustar algo que no encuentra en el panel, contacte a AInnovation. Este documento se actualiza cada vez que cambien las tablas de GNP o que se recalibre algún producto contra nuevos PDFs oficiales.
