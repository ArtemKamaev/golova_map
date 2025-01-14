const USERGEO = false;
const MARK_ICON = "./img/markers_1.svg";
const MARK_ICON_ACTIVE = "./img/markers_2.svg";

const formdata = new FormData();
formdata.append("method", "get_companies");

const apiLink = "data.json";
// const apiLink = "https://adminka.golova.io/api/rest_api.php";
const requestOptions = {
  // method: "POST",
  // body: formdata,
  // redirect: "follow"
};

async function main() {
  // ожидание загрузки модулей
  await ymaps3.ready;
  const {
    YMap,
    YMapDefaultSchemeLayer,
    YMapControls,
    YMapControl,
    YMapDefaultFeaturesLayer,
    YMapMarker,
    YMapListener,
  } = ymaps3;

  // Импорт модулей для элементов управления на карте
  const { YMapZoomControl, YMapGeolocationControl } = await ymaps3.import(
    "@yandex/ymaps3-controls@0.0.1"
  );
  ymaps3.import.registerCdn("https://cdn.jsdelivr.net/npm/{package}", [
    "@yandex/ymaps3-clusterer@0.0.10",
  ]);
  const { YMapClusterer, clusterByGrid } = await ymaps3.import(
    "@yandex/ymaps3-clusterer"
  );

  // Координаты центра карты
  const CENTER_COORDINATES = [69.138043, 54.861948];

  // Объект с параметрами центра и зумом карты
  const LOCATION = { center: CENTER_COORDINATES, zoom: 4 };

  // Создание объекта карты
  const map = new YMap(document.getElementById("map"), { location: LOCATION });

  // Добавление слоев на карту
  map.addChild(new YMapDefaultSchemeLayer());
  map.addChild(new YMapDefaultFeaturesLayer());

  // Добавление элементов управления на карту
  map.addChild(
    new YMapControls({
      position: "top right",
      orientation: "vertical",
    }).addChild(new YMapZoomControl({}))
  );
  map.addChild(
    new YMapControls({ position: "bottom right" }).addChild(
      new YMapGeolocationControl({})
    )
  );

  // Добавление центра карты
  map.addChild(new YMapMarker({ coordinates: CENTER_COORDINATES }));

  let userCoords = [];

  if (USERGEO) {
    // Получаем координаты пользователя
    await getCurrentPosition()
      .then((position) => {
        userCoords = [position.coords.longitude, position.coords.latitude];
      })
      .catch((error) => {
        console.error("Ошибка:", error.message);
      });
  }

  // Данные организаций
  let organizations = [];

  // Получаем список организаций от api
  try {
    const response = await fetch(apiLink, requestOptions);

    organizations = await response.json();
  } catch (error) {}

  // Если получены координаты пользователя, центрируем по ним, иначе зумим по крайним маркерам
  if (userCoords.length) {
    map.update({
      location: { center: userCoords, zoom: 10 },
    });
  } else {
    map.update({
      location: {
        bounds: getBounds(
          organizations.map((element, i) => element.coordinates)
        ),
      },
    });
  }

  const points = organizations.map((element, i) => ({
    type: "Feature",
    id: i,
    geometry: { coordinates: element.coordinates },
    properties: {
      coordinates: element.coordinates,
      logo: element.logo,
      name: element.name,
      slogan: element.slogan,
      tags: element.tags,
      city: element.city,
      office_hours: element.office_hours,
      description: element.description,
      link: element.link,
      tel: element.tel,
      email: element.email,
      condition_work: element.condition_work,
    },
  }));

  // Список маркеров нужен для их обновления по событию
  let markersList = [];

  const marker = (feature) => {
    // Создаем изображение маркера
    const el = document.createElement("img");
    el.id = `my_marker_${feature.id}`;
    el.className = "my-marker";
    el.src = MARK_ICON;
    el.title = feature.properties.name;

    // Контейнер для элементов маркера
    const markerContainer = document.createElement("div");
    markerContainer.appendChild(el);

    const marker = new YMapMarker(
      {
        coordinates: feature.geometry.coordinates,
        onClick() {},
        zIndex: 0,
      },
      markerContainer
    );

    // При клике на маркер меняем центр карты на LOCATION с заданным duration
    el.onclick = () => {
      map.update({
        location: { center: feature.geometry.coordinates, duration: 400 },
      });

      const isOpen = document.getElementById(`popup_${feature.id}`);

      markersList.forEach((m) => {
        // Сбрасываем преоритет видимости маркера
        m.update({ zIndex: 0 });
        // Сбрасываем активный маркер
        m.element.querySelector(".my-marker").src = MARK_ICON;
        // Удаляем открытый popup
        m.element.querySelector(".popup")?.remove();
      });

      // Если у нас не открыт popup, открываем его, эта проверка нужна, чтобы при клике на активный маркер, popup не открывался снова
      if (!isOpen) {
        // Создаем всплывающее окно маркера
        const markerPopup = document.createElement("div");
        markerPopup.id = `popup_${feature.id}`;
        markerPopup.className = "popup";
        markerPopup.appendChild(popupNode(feature.properties, feature.id));

        // Меняем вид маркера на активный
        el.src = MARK_ICON_ACTIVE;
        // Повышаем преоритет видимости маркера
        marker.update({ zIndex: 100 });
        // Открываем popup
        markerContainer.appendChild(markerPopup);
      }
    };

    // Добавляем марке в список
    markersList.push(marker);

    return marker;
  };

  // Добавляем маркеры в кластер
  const cluster = (coordinates, features) => {
    return new YMapMarker(
      {
        coordinates,
        onClick() {
          // По клику на кластер, приближаем карту до видимости маркеров
          const bounds = getBounds(
            features.map((feature) => feature.geometry.coordinates)
          );
          map.update({
            location: { bounds, easing: "ease-in-out", duration: 1000 },
          });
        },
      },
      circle(features.length).cloneNode(true)
    );
  };

  // Создаем и добавляем кластер
  const clusterer = new YMapClusterer({
    method: clusterByGrid({ gridSize: 64 }),
    features: points,
    marker,
    cluster,
  });
  map.addChild(clusterer);

  // Добавляем боковую панель на карту
  const controls = new YMapControls({
    position: "top left",
    orientation: "vertical",
  });
  const control = new YMapControl({}, sidebarNode());
  controls.addChild(control);
  map.addChild(controls);

  // Создание объекта-слушателя.
  const mapListener = new YMapListener({
    layer: "any",
    onStateChanged: () => {
      setOrgListByVisibleMarkers();
    },
  });

  document?.addEventListener("click", (event) => {
    let currentElement = event.target;

    while (currentElement) {
      if (
        currentElement.classList.contains("ymaps3x0--marker") ||
        currentElement.classList.contains("sidebar")
      ) {
        break;
      }
      currentElement = currentElement.parentElement;
    }

    if (!currentElement) {
      markersList.forEach((m) => {
        // Сбрасываем преоритет видимости маркера
        m.update({ zIndex: 0 });
        // Сбрасываем активный маркер
        m.element.querySelector(".my-marker").src = MARK_ICON;
        // Удаляем открытый popup
        m.element.querySelector(".popup")?.remove();
      });
    }
  });

  // Добавление слушателя на карту.
  map.addChild(mapListener);

  function getBounds(coordinates) {
    let minLat = Infinity,
      minLng = Infinity;
    let maxLat = -Infinity,
      maxLng = -Infinity;

    for (const coords of coordinates) {
      const lat = coords[1];
      const lng = coords[0];

      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
    }

    return [
      [minLng, minLat],
      [maxLng, maxLat],
    ];
  }

  // Создаем всплывающее окно с информацией об организации
  function popupNode(properties, id) {
    const popupElement = document.createElement("div");
    popupElement.innerHTML =
      `
      <img src="${properties.logo}" class="logo" alt="logo_organization">

      <div class="header">
        <div class="title">${properties.name}</div>
        <div class="slogan">${properties.slogan}</div>
        <div class="tags">` +
      (properties.tags.length ? "#" : "") +
      `${properties.tags.join("#")}
        </div>
      </div>

      <div class="geo">
        <div class="office">
          <div class="city">
            <svg width="16" height="20" viewBox="0 0 16 20" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M13.2072 11.1747C12.5522 12.5019 11.6656 13.8251 10.7572 15.0126C9.85165 16.1963 8.94303 17.221 8.2596 17.9506C8.16879 18.0475 8.08207 18.1391 8 18.2251C7.91793 18.1391 7.83121 18.0475 7.7404 17.9506C7.05697 17.221 6.14835 16.1963 5.24281 15.0126C4.33443 13.8251 3.44781 12.5019 2.79279 11.1747C2.13101 9.83384 1.75 8.57738 1.75 7.5C1.75 4.04822 4.54822 1.25 8 1.25C11.4518 1.25 14.25 4.04822 14.25 7.5C14.25 8.57738 13.869 9.83384 13.2072 11.1747ZM8 20C8 20 15.5 12.8921 15.5 7.5C15.5 3.35786 12.1421 0 8 0C3.85786 0 0.5 3.35786 0.5 7.5C0.5 12.8921 8 20 8 20Z" fill="#333333"/>
              <path d="M8 10C6.61929 10 5.5 8.88071 5.5 7.5C5.5 6.11929 6.61929 5 8 5C9.38071 5 10.5 6.11929 10.5 7.5C10.5 8.88071 9.38071 10 8 10ZM8 11.25C10.0711 11.25 11.75 9.57107 11.75 7.5C11.75 5.42893 10.0711 3.75 8 3.75C5.92893 3.75 4.25 5.42893 4.25 7.5C4.25 9.57107 5.92893 11.25 8 11.25Z" fill="#333333"/>
            </svg>
            ${properties.city}
          </div>
          <div class="clock">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M10 19C14.9706 19 19 14.9706 19 10C19 5.02944 14.9706 1 10 1C5.02944 1 1 5.02944 1 10C1 14.9706 5.02944 19 10 19Z" stroke="#333333" stroke-width="1.5" stroke-miterlimit="10"/>
              <path d="M10 6.0625V10H13.9375" stroke="#333333" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            с ${properties.office_hours.start} до ${properties.office_hours.end}
          </div>
        </div>
        <div class="coordinates">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M10.625 0.625C10.625 0.279822 10.3452 0 10 0C9.65482 0 9.375 0.279822 9.375 0.625V1.27198C5.04064 1.57787 1.57787 5.04064 1.27198 9.375H0.625C0.279822 9.375 0 9.65482 0 10C0 10.3452 0.279822 10.625 0.625 10.625H1.27198C1.57787 14.9594 5.04064 18.4221 9.375 18.728V19.375C9.375 19.7202 9.65482 20 10 20C10.3452 20 10.625 19.7202 10.625 19.375V18.728C14.9594 18.4221 18.4221 14.9594 18.728 10.625H19.375C19.7202 10.625 20 10.3452 20 10C20 9.65482 19.7202 9.375 19.375 9.375H18.728C18.4221 5.04064 14.9594 1.57787 10.625 1.27198V0.625ZM2.52567 9.375C2.82626 5.73138 5.73138 2.82626 9.375 2.52567V3.125C9.375 3.47018 9.65482 3.75 10 3.75C10.3452 3.75 10.625 3.47018 10.625 3.125V2.52567C14.2686 2.82626 17.1737 5.73138 17.4743 9.375H16.875C16.5298 9.375 16.25 9.65482 16.25 10C16.25 10.3452 16.5298 10.625 16.875 10.625H17.4743C17.1737 14.2686 14.2686 17.1737 10.625 17.4743V16.875C10.625 16.5298 10.3452 16.25 10 16.25C9.65482 16.25 9.375 16.5298 9.375 16.875V17.4743C5.73138 17.1737 2.82626 14.2686 2.52567 10.625H3.125C3.47018 10.625 3.75 10.3452 3.75 10C3.75 9.65482 3.47018 9.375 3.125 9.375H2.52567ZM10 12.5C11.3807 12.5 12.5 11.3807 12.5 10C12.5 8.61929 11.3807 7.5 10 7.5C8.61929 7.5 7.5 8.61929 7.5 10C7.5 11.3807 8.61929 12.5 10 12.5Z" fill="#333333"/>
          </svg>
         ${properties.coordinates[1]}, ${properties.coordinates[0]}
        </div>
      </div>

      <div class="description-block">
        <div class="desc-title">Направление деятельностии:</div>
        <div class="description">${properties.description}</div>
        <div class="more">
          <span class="toggle-more">
            <span>Читать полностью</span>
            <svg width="6" height="7" viewBox="0 0 6 7" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M0.19676 0.671563C0.392022 0.4763 0.708604 0.4763 0.903866 0.671563L5.00006 4.76776L5.00006 1.99998C5.00006 1.72384 5.22392 1.49998 5.50006 1.49998C5.7762 1.49998 6.00006 1.72384 6.00006 1.99998L6.00006 5.97486C6.00006 6.25101 5.7762 6.47486 5.50006 6.47486L1.52523 6.47486C1.24908 6.47486 1.02523 6.251 1.02523 5.97486C1.02523 5.69872 1.24908 5.47486 1.52523 5.47486L4.29295 5.47486L0.19676 1.37867C0.00149775 1.18341 0.00149775 0.866825 0.19676 0.671563Z" fill="#333333"/>
            </svg>
          </span>
        </div>
      </div>

      <div class="contacts">
        <div class="link">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M0 10C0 4.47715 4.47715 0 10 0C15.5228 0 20 4.47715 20 10C20 15.5228 15.5228 20 10 20C4.47715 20 0 15.5228 0 10ZM9.375 1.34569C8.53821 1.6016 7.70577 2.37153 7.01593 3.66498C6.83703 4.00043 6.67168 4.3648 6.52214 4.75451C7.4036 4.95113 8.36312 5.0764 9.375 5.11319V1.34569ZM5.31064 4.4243C5.48928 3.94419 5.69084 3.49327 5.91299 3.07675C6.13639 2.65788 6.38578 2.26551 6.65908 1.91044C5.58692 2.35372 4.62207 3.00393 3.81431 3.8113C4.26617 4.0411 4.76762 4.24722 5.31064 4.4243ZM4.38556 9.37499C4.43093 8.03748 4.62105 6.76578 4.93104 5.61536C4.21916 5.38377 3.56222 5.10377 2.97557 4.7818C2.00801 6.08216 1.39298 7.66038 1.27197 9.37499H4.38556ZM6.13586 5.94855C5.85778 6.98305 5.68121 8.14123 5.63632 9.37499H9.375V6.36393C8.23775 6.32533 7.14634 6.18197 6.13586 5.94855ZM10.625 6.36393V9.37499H14.3637C14.3188 8.14123 14.1422 6.98305 13.8641 5.94855C12.8536 6.18197 11.7622 6.32533 10.625 6.36393ZM5.63632 10.625C5.68121 11.8588 5.85778 13.0169 6.13586 14.0514C7.14634 13.818 8.23775 13.6747 9.375 13.6361V10.625H5.63632ZM10.625 10.625V13.6361C11.7622 13.6747 12.8536 13.818 13.8641 14.0514C14.1422 13.0169 14.3188 11.8588 14.3637 10.625H10.625ZM6.52214 15.2455C6.67168 15.6352 6.83703 15.9996 7.01593 16.335C7.70577 17.6285 8.53821 18.3984 9.375 18.6543V14.8868C8.36312 14.9236 7.4036 15.0489 6.52214 15.2455ZM6.65908 18.0895C6.38578 17.7345 6.13639 17.3421 5.91299 16.9232C5.69084 16.5067 5.48928 16.0558 5.31064 15.5757C4.76762 15.7528 4.26617 15.9589 3.81431 16.1887C4.62208 16.9961 5.58693 17.6463 6.65908 18.0895ZM4.93104 14.3846C4.62105 13.2342 4.43093 11.9625 4.38556 10.625H1.27197C1.39298 12.3396 2.00801 13.9178 2.97558 15.2182C3.56222 14.8962 4.21916 14.6162 4.93104 14.3846ZM13.3409 18.0895C14.4131 17.6463 15.3779 16.9961 16.1857 16.1887C15.7338 15.9589 15.2324 15.7528 14.6893 15.5757C14.5107 16.0558 14.3091 16.5067 14.087 16.9232C13.8636 17.3421 13.6142 17.7345 13.3409 18.0895ZM10.625 14.8868V18.6543C11.4618 18.3984 12.2942 17.6285 12.9841 16.335C13.163 15.9996 13.3283 15.6352 13.4778 15.2455C12.5964 15.0489 11.6369 14.9236 10.625 14.8868ZM15.069 14.3846C15.7808 14.6162 16.4378 14.8962 17.0244 15.2182C17.992 13.9178 18.607 12.3396 18.728 10.625H15.6144C15.5691 11.9625 15.3789 13.2342 15.069 14.3846ZM18.728 9.37499C18.607 7.66038 17.992 6.08216 17.0244 4.7818C16.4378 5.10377 15.7808 5.38377 15.069 5.61536C15.3789 6.76578 15.5691 8.03748 15.6144 9.37499H18.728ZM14.087 3.07675C14.3091 3.49327 14.5107 3.94419 14.6893 4.4243C15.2324 4.24722 15.7338 4.0411 16.1857 3.8113C15.3779 3.00393 14.4131 2.35372 13.3409 1.91044C13.6142 2.26551 13.8636 2.65788 14.087 3.07675ZM13.4778 4.75451C13.3283 4.3648 13.163 4.00043 12.9841 3.66498C12.2942 2.37153 11.4618 1.6016 10.625 1.34569V5.11319C11.6369 5.0764 12.5964 4.95113 13.4778 4.75451Z" fill="#333333"/>
          </svg>
          <a href="${properties.link}" target="_blank">${properties.link}</a>
        </div>
        <div class="tel">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M4.56734 1.66061C4.25429 1.25812 3.65931 1.22108 3.29875 1.58163L2.00635 2.87404C1.40201 3.47838 1.17984 4.33457 1.44388 5.08559C2.50422 8.10155 4.24019 10.9334 6.6534 13.3466C9.06661 15.7598 11.8985 17.4958 14.9144 18.5561C15.6654 18.8202 16.5216 18.598 17.126 17.9937L18.4184 16.7012C18.7789 16.3407 18.7419 15.7457 18.3394 15.4327L15.4567 13.1905C15.251 13.0306 14.9833 12.9741 14.7306 13.0373L11.9943 13.7214C11.251 13.9072 10.4648 13.6894 9.92306 13.1477L6.85234 10.0769C6.31061 9.53522 6.09284 8.74898 6.27865 8.00574L6.96273 5.26941C7.02591 5.0167 6.9694 4.74897 6.80947 4.54335L4.56734 1.66061ZM2.35597 0.638845C3.28361 -0.288798 4.81437 -0.193496 5.61979 0.842043L7.86192 3.72478C8.27338 4.2538 8.41877 4.94261 8.25623 5.59278L7.57215 8.32911C7.49992 8.618 7.58457 8.92359 7.79513 9.13415L10.8659 12.2049C11.0764 12.4154 11.382 12.5001 11.6709 12.4279L14.4072 11.7438C15.0574 11.5812 15.7462 11.7266 16.2752 12.1381L19.158 14.3802C20.1935 15.1856 20.2888 16.7164 19.3612 17.644L18.0688 18.9364C17.1441 19.8611 15.7611 20.2671 14.4722 19.814C11.2719 18.6888 8.26798 16.8468 5.71061 14.2894C3.15324 11.732 1.31119 8.72807 0.186048 5.52781C-0.267103 4.2389 0.138913 2.8559 1.06356 1.93125L2.35597 0.638845Z" fill="#333333"/>
          </svg>
          ${properties.tel}
        </div>
        <div class="email">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M10.5882 1.64706C10.2206 1.45098 9.77941 1.45098 9.41177 1.64706L1.91176 5.64706C1.50444 5.8643 1.25 6.28836 1.25 6.75V7.77113L8.4375 12.0836L10 11.1461L11.5625 12.0836L18.75 7.77113V6.75C18.75 6.28836 18.4956 5.8643 18.0882 5.64706L10.5882 1.64706ZM18.75 9.22887L12.7773 12.8125L18.75 16.3961V9.22887ZM18.7066 17.8278L10 12.6039L1.29343 17.8278C1.43744 18.3592 1.92308 18.75 2.5 18.75H17.5C18.0769 18.75 18.5626 18.3592 18.7066 17.8278ZM1.25 16.3961L7.22272 12.8125L1.25 9.22887V16.3961ZM8.82353 0.544118C9.55882 0.151961 10.4412 0.151961 11.1765 0.544118L18.6765 4.54412C19.4911 4.9786 20 5.82672 20 6.75V17.5C20 18.8807 18.8807 20 17.5 20H2.5C1.11929 20 0 18.8807 0 17.5V6.75C0 5.82672 0.508871 4.9786 1.32353 4.54412L8.82353 0.544118Z" fill="#333333"/>
          </svg>
          ${properties.email}
        </div>
      </div>

      <div class="condition">${properties.condition_work}</div>
    `;

    const closeBtn = document.createElement("div");
    closeBtn.innerHTML = `
      <div class="close-popup">
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M15.625 4.375L4.375 15.625" stroke="black" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M15.625 15.625L4.375 4.375" stroke="black" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </div>
      `;

    closeBtn.onclick = () => {
      // Удаляем открытый popup
      document.getElementById(`popup_${id}`).remove();

      // Сбрасываем активные маркеры
      const myMarkers = document.querySelectorAll(".my-marker");
      myMarkers.forEach((element) => {
        element.src = MARK_ICON;
      });

      // Сбрасываем преоритет видимости маркеров
      markersList.forEach((element) => {
        element.update({ zIndex: 0 });
      });
    };

    popupElement.append(closeBtn);

    const textContainer = popupElement.querySelector(
      ".description-block .description"
    );
    const toggleMore = popupElement.querySelector(
      ".description-block .toggle-more"
    );

    function checkOverflow() {
      const lineHeight = parseFloat(getComputedStyle(textContainer).lineHeight);
      const maxLines = 3;
      const maxHeight = lineHeight * maxLines;

      const tolerance = 1;

      if (textContainer.scrollHeight > maxHeight + tolerance) {
        textContainer.classList.add("overflowed");
        toggleMore.style.display = "block"; // Показываем кнопку
      } else {
        textContainer.classList.remove("overflowed");
        toggleMore.style.display = "none"; // Скрываем кнопку
      }
    }

    toggleMore.addEventListener("click", () => {
      textContainer.classList.toggle("expanded");
      toggleMore.querySelector("span").textContent =
        textContainer.classList.contains("expanded")
          ? "Скрыть"
          : "Читать полностью";
      toggleMore.querySelector("svg").style.transform =
        textContainer.classList.contains("expanded")
          ? "rotate(180deg)"
          : "rotate(0deg)";
    });

    setTimeout(() => {
      window.addEventListener(
        "resize",
        function (event) {
          checkOverflow();
        },
        true
      );
      checkOverflow();
    }, 100);

    return popupElement;
  }

  // Создаем кружок кластера
  function circle(count) {
    const circle = document.createElement("div");
    circle.classList.add("circle");
    circle.innerHTML = `
          <div class="circle-content">
              <span class="circle-text">${count}</span>
          </div>;
      `;
    return circle;
  }

  // Создаем списак организаций для боковой панели
  function orgListNode(orgs) {
    const orgContainer = document.createElement("div");
    orgContainer.classList.add("sidebar-organizations");

    orgs.forEach((element, index) => {
      const orgItem = document.createElement("div");
      orgItem.classList.add("sidebar-org-item");
      orgItem.innerHTML = `
        <div class="sidebar-org-name">${index + 1}. ${
        element.properties.name
      }</div>
        <div class="sidebar-org-desc">${element.properties.slogan}</div>
      `;

      orgItem.onclick = () => {
        map.update({
          location: {
            center: element.properties.coordinates,
            zoom: 15,
            duration: 400,
          },
        });

        setTimeout(() => {
          document.getElementById(`my_marker_${element.id}`)?.click();
        }, 600);

        if (window.innerWidth <= 640) {
          const sidebar = document.querySelector(".sidebar");
          sidebar.style.left = sidebar.style.left ? null : 0;
        }
      };

      orgContainer.appendChild(orgItem);
    });

    return orgContainer;
  }

  // Создаем боковую панель
  function sidebarNode() {
    const sidebar = document.createElement("div");
    sidebar.classList.add("sidebar");

    const closeBtn = document.createElement("button");
    closeBtn.classList.add("sidebar-close-btn");
    closeBtn.type = "button";
    closeBtn.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" style="transform: rotate(180deg);" width="16" height="16" fill="currentColor" class="bi bi-chevron-left" viewBox="0 0 16 16">
        <path fill-rule="evenodd" d="M11.354 1.646a.5.5 0 0 1 0 .708L5.707 8l5.647 5.646a.5.5 0 0 1-.708.708l-6-6a.5.5 0 0 1 0-.708l6-6a.5.5 0 0 1 .708 0z"/>
      </svg>
    `;
    closeBtn.onclick = () => {
      sidebar.style.left = sidebar.style.left ? null : 0;
      closeBtn.querySelector("svg").style.transform = sidebar.style.left
        ? "rotate(0deg)"
        : "rotate(180deg)";
    };
    sidebar.appendChild(closeBtn);

    const sidebarContainer = document.createElement("div");
    sidebarContainer.classList.add("sidebar-container");
    sidebar.appendChild(sidebarContainer);

    const header = document.createElement("div");
    header.classList.add("sidebar-header");
    sidebarContainer.appendChild(header);

    const searchContainer = document.createElement("div");
    searchContainer.classList.add("sidebar-search-container");
    searchContainer.innerHTML = `
      <div class="sidebar-search-icon">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M11.7422 10.3439C12.5329 9.2673 13 7.9382 13 6.5C13 2.91015 10.0899 0 6.5 0C2.91015 0 0 2.91015 0 6.5C0 10.0899 2.91015 13 6.5 13C7.93858 13 9.26801 12.5327 10.3448 11.7415L10.3439 11.7422C10.3734 11.7822 10.4062 11.8204 10.4424 11.8566L14.2929 15.7071C14.6834 16.0976 15.3166 16.0976 15.7071 15.7071C16.0976 15.3166 16.0976 14.6834 15.7071 14.2929L11.8566 10.4424C11.8204 10.4062 11.7822 10.3734 11.7422 10.3439ZM12 6.5C12 9.53757 9.53757 12 6.5 12C3.46243 12 1 9.53757 1 6.5C1 3.46243 3.46243 1 6.5 1C9.53757 1 12 3.46243 12 6.5Z" fill="#3C4257"/>
        </svg>
      </div>
    `;
    header.appendChild(searchContainer);

    const searchInputBlock = document.createElement("div");
    searchInputBlock.classList.add("sidebar-search-input");
    searchContainer.appendChild(searchInputBlock);

    const searchInput = document.createElement("input");
    searchInput.type = "text";
    searchInput.placeholder = "Поиск";
    searchInput.oninput = (event) => {
      if (event.target.value.length) {
        sidebarContainer.querySelector(".sidebar-organizations").remove();
        sidebarContainer.appendChild(
          orgListNode(
            points.filter(({ properties }) =>
              properties.name.toLowerCase().includes(event.target.value)
            )
          )
        );
      } else {
        setOrgListByVisibleMarkers();
      }
    };
    searchInputBlock.appendChild(searchInput);

    const closeIcon = document.createElement("div");
    closeIcon.classList.add("sidebar-search-close");
    closeIcon.innerHTML = `
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M0.878141 1.49686C0.707286 1.326 0.707286 1.049 0.878141 0.878141C1.049 0.707286 1.32601 0.707286 1.49686 0.878141L6 5.38128L10.5031 0.878141C10.674 0.707286 10.951 0.707286 11.1219 0.878141C11.2927 1.049 11.2927 1.326 11.1219 1.49686L6.61872 6L11.1219 10.5031C11.2927 10.674 11.2927 10.951 11.1219 11.1219C10.951 11.2927 10.674 11.2927 10.5031 11.1219L6 6.61872L1.49686 11.1219C1.32601 11.2927 1.049 11.2927 0.878141 11.1219C0.707287 10.951 0.707287 10.674 0.878141 10.5031L5.38128 6L0.878141 1.49686Z" fill="#3C4257"/>
      </svg>
    `;
    closeIcon.onclick = () => {
      sidebar.style.left = sidebar.style.left ? null : 0;
      closeBtn.querySelector("svg").style.transform = sidebar.style.left
        ? "rotate(0deg)"
        : "rotate(180deg)";
    };
    header.appendChild(closeIcon);

    sidebarContainer.appendChild(orgListNode(points));

    return sidebar;
  }

  // Получаем видимые маркеров
  function getVisibleMarkers() {
    const [sw, ne] = map.bounds;

    const visibleMarkers = points.filter((marker) => {
      const [lat, lng] = marker.geometry.coordinates;

      return lat >= sw[0] && lat <= ne[0] && lng >= ne[1] && lng <= sw[1];
    });

    return visibleMarkers;
  }

  // Добавляем видимые маркеры в sidebar
  function setOrgListByVisibleMarkers() {
    const sidebarContainer = document.querySelector(".sidebar-container");
    sidebarContainer.querySelector(".sidebar-organizations").remove();
    sidebarContainer.appendChild(orgListNode(getVisibleMarkers()));
  }

  function getCurrentPosition() {
    return new Promise((resolve, reject) => {
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (position) => resolve(position),
          (error) => reject(error)
        );
      } else {
        reject(new Error("Geolocation не поддерживается вашим браузером."));
      }
    });
  }
}
main();
