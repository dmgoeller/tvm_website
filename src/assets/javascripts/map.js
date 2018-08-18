
var mapNode = null;

function showMap() {
  var script  = document.createElement('script');
  script.type = 'text/javascript';
  script.src  = 'https://maps.googleapis.com/maps/api/js?' +
                'key={GOOGLE_MAPS_API_KEY}' +
                'callback=initMap';

  document.head.appendChild(script);

  select('#map').classList.remove('hidden');
  select('#show-map-button').classList.add('hidden');
}

function initMap() {
  var location = {lat: 50.4918396, lng: 7.4824281};
  
  var map = new google.maps.Map(select('#map'), {
    zoom: 15,
    center: location,
    clickableIcons: false,
    backgroundColor: '#e8e8e8'
  });
  var marker = new google.maps.Marker({
    position: location,
    map: map
  });
}

function storeMap() {
  var map = select('#map');

  if (!map.classList.contains('hidden')) {
    mapNode = map.cloneNode(true);
  }
}

function restoreMap() {
  if (mapNode) {
    select('#show-map-button').classList.add('hidden')
    select('#map').replaceWith(mapNode);
  }
}

