export const STARTING_CASH = 5000;
export const MAX_PLAYERS = 6;
export const MIN_PLAYERS = 3;
export const TOTAL_ROUNDS = 5;
export const MIN_ITEM_PRICE = 300;
export const MAX_ITEM_PRICE = 1200;

export const ITEMS = [
  { id: 'pocket-watch', name: 'Карманные часы', description: 'Старинные часы с металлическим корпусом.', basePrice: 400, marketValue: 550 },
  { id: 'sea-compass', name: 'Морской компас', description: 'Латунный компас с потёртой крышкой.', basePrice: 500, marketValue: 620 },
  { id: 'telescope', name: 'Старый телескоп', description: 'Компактный телескоп для наблюдения за звёздами.', basePrice: 950, marketValue: 1100 },
  { id: 'pocket-mirror', name: 'Карманное зеркало', description: 'Зеркало в декоративной оправе.', basePrice: 350, marketValue: 440 },
  { id: 'ornate-key', name: 'Декоративный ключ', description: 'Необычный ключ неизвестного назначения.', basePrice: 350, marketValue: 500 },
  { id: 'film-camera', name: 'Плёночный фотоаппарат', description: 'Старая камера с механическим затвором.', basePrice: 650, marketValue: 780 },
  { id: 'porcelain-figurine', name: 'Фарфоровая статуэтка', description: 'Небольшая декоративная статуэтка.', basePrice: 450, marketValue: 600 },
  { id: 'golden-cup', name: 'Золотой кубок', description: 'Кубок с тонкой гравировкой.', basePrice: 800, marketValue: 980 },
  { id: 'bronze-statue', name: 'Бронзовая статуэтка', description: 'Тяжёлая фигурка с патиной.', basePrice: 850, marketValue: 1020 },
  { id: 'framed-painting', name: 'Картина в раме', description: 'Небольшая картина в деревянной раме.', basePrice: 700, marketValue: 900 },
  { id: 'crystal-vase', name: 'Кристальная ваза', description: 'Прозрачная ваза с огранёнными гранями.', basePrice: 650, marketValue: 790 },
  { id: 'silver-candlestick', name: 'Серебряный подсвечник', description: 'Старинный подсвечник из серебристого металла.', basePrice: 600, marketValue: 740 },
  { id: 'music-box', name: 'Музыкальная шкатулка', description: 'Шкатулка с заводным музыкальным механизмом.', basePrice: 700, marketValue: 880 },
  { id: 'antique-lamp', name: 'Антикварная лампа', description: 'Настольная лампа с узорным основанием.', basePrice: 500, marketValue: 640 },
  { id: 'ship-in-bottle', name: 'Корабль в бутылке', description: 'Миниатюрный корабль внутри стеклянной бутылки.', basePrice: 750, marketValue: 920 },
  { id: 'old-book', name: 'Старая книга', description: 'Книга с пожелтевшими страницами.', basePrice: 550, marketValue: 700 },
  { id: 'vinyl-record', name: 'Виниловая пластинка', description: 'Пластинка в бумажном конверте.', basePrice: 300, marketValue: 430 },
  { id: 'postcard-set', name: 'Коллекция открыток', description: 'Набор старых открыток из разных городов.', basePrice: 600, marketValue: 750 },
  { id: 'old-map', name: 'Старинная карта', description: 'Карта с ручными пометками.', basePrice: 450, marketValue: 630 },
  { id: 'coin-collection', name: 'Коллекция монет', description: 'Несколько монет разных лет.', basePrice: 1000, marketValue: 1180 },
  { id: 'postage-stamp', name: 'Почтовая марка', description: 'Старая марка с необычным рисунком.', basePrice: 400, marketValue: 570 },
  { id: 'engraved-medal', name: 'Медаль с гравировкой', description: 'Металлическая медаль с надписью.', basePrice: 550, marketValue: 690 },
  { id: 'porcelain-cup', name: 'Фарфоровая чашка', description: 'Чашка с тонким декоративным узором.', basePrice: 350, marketValue: 460 },
  { id: 'binoculars', name: 'Бинокль', description: 'Компактный бинокль в старом футляре.', basePrice: 450, marketValue: 610 },
  { id: 'golden-pen', name: 'Золотое перо', description: 'Письменное перо с золотистым наконечником.', basePrice: 600, marketValue: 760 },
  { id: 'wooden-box', name: 'Деревянная шкатулка', description: 'Шкатулка с металлическими уголками.', basePrice: 500, marketValue: 660 },
  { id: 'perfume-bottle', name: 'Флакон старых духов', description: 'Стеклянный флакон необычной формы.', basePrice: 300, marketValue: 420 },
  { id: 'chess-set', name: 'Шахматный набор', description: 'Деревянная доска с комплектом фигур.', basePrice: 750, marketValue: 940 },
  { id: 'gemstone', name: 'Драгоценный камень', description: 'Огранённый камень в простой коробочке.', basePrice: 1100, marketValue: 1250 },
  { id: 'gramophone', name: 'Граммофон', description: 'Старинный проигрыватель с латунным раструбом.', basePrice: 900, marketValue: 1120 }
];

export const FEATURES = [
  { id: 'bonus-100', name: 'Повышенная стоимость', description: '+100 к итоговой стоимости предмета.', delta: 100 },
  { id: 'bonus-200', name: 'Ценный экземпляр', description: '+200 к итоговой стоимости предмета.', delta: 200 },
  { id: 'artist-signature', name: 'Подпись автора', description: '+150 к итоговой стоимости предмета.', delta: 150 },
  { id: 'authenticity', name: 'Подтверждённая подлинность', description: '+150 к итоговой стоимости предмета.', delta: 150 },
  { id: 'original-box', name: 'Оригинальная упаковка', description: '+100 к итоговой стоимости предмета.', delta: 100 },
  { id: 'complete-set', name: 'Полный комплект', description: '+150 к итоговой стоимости предмета.', delta: 150 },
  { id: 'damaged', name: 'Повреждённый предмет', description: '−200 к итоговой стоимости предмета.', delta: -200 },
  { id: 'worn', name: 'Следы времени', description: '−100 к итоговой стоимости предмета.', delta: -100 }
];

export function makeLots(random = Math.random, count = 3) {
  const pool = [...ITEMS];
  const lots = [];
  for (let i = 0; i < Math.min(count, pool.length); i += 1) {
    const index = Math.floor(random() * pool.length);
    const [item] = pool.splice(index, 1);
    const hasFeature = random() < 0.58;
    const feature = hasFeature ? FEATURES[Math.floor(random() * FEATURES.length)] : null;
    const startPrice = Math.max(MIN_ITEM_PRICE, Math.min(MAX_ITEM_PRICE, item.basePrice));
    lots.push({
      lotId: `${item.id}-${Math.floor(random() * 1e9).toString(36)}`,
      itemId: item.id,
      name: item.name,
      description: item.description,
      startPrice,
      marketValue: Math.max(0, item.marketValue + (feature?.delta ?? 0)),
      feature: feature ? { id: feature.id, name: feature.name, description: feature.description, delta: feature.delta } : null
    });
  }
  return lots;
}
