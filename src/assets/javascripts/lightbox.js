
function showLightbox(gallery, position = 0) {
  gallery         = select(gallery);
  var lightbox    = document.body.addElement('div', 'lightbox');
  var container   = lightbox.addElement('div', 'lb-container');
  var viewport    = container.addElement('div', 'lb-viewport');
  var pictures    = viewport.addElement('div', 'lb-pictures');
  var closeButton = container.addElement('div', 'lb-button lb-close-button icon icon-close');
  var prevButton  = container.addElement('div', 'lb-button lb-prev-button icon icon-chevron-left');
  var nextButton  = container.addElement('div', 'lb-button lb-next-button icon icon-chevron-right');

  var posToPx = function(pos) {
    return pos * (viewport.offsetWidth + 8);
  }

  var moveTo = function(newPosition, transition = 'none') {
    position = Math.max(0, Math.min(pictureCount - 1, newPosition));
    if (position == 0) {
      prevButton.classList.add('disabled');
    } else {
      prevButton.classList.remove('disabled');
    }
    if (position == pictureCount - 1) {
      nextButton.classList.add('disabled');
    } else {
      nextButton.classList.remove('disabled');
    }
    pictures.style.transition = transition;
    pictures.style.transform = 'translate(-' + posToPx(position) + 'px, 0)';
  }

  // pcitures
  var pictureCount  = 0;

  gallery.querySelectorAll('picture').forEach(function(original) {
    var copy = pictures.addElement('picture');
    
    Array.from(original.children).forEach(function(child) {
      var nodeName = child.nodeName.toLowerCase(); 

      if (nodeName == 'source' || nodeName == 'img') {
        copy.appendChild(child.cloneNode(true));
      }
    });
    pictureCount++;
  });

  // button actions
  closeButton.onclick = function() { lightbox.remove(); }  
  prevButton.onclick  = function() { moveTo(position - 1, '.6s'); } 
  nextButton.onclick  = function() { moveTo(position + 1, '.6s'); }

  // touch events
  var touchStartX = null;

  pictures.addEventListener('touchstart', function(event) {
    if (event.touches.length == 1) {
      touchStartX = event.touches[0].clientX;
      pictures.style.transition = 'none';
    }
    event.preventDefault();
  }, {passive: false});

  pictures.addEventListener('touchmove', function(event) {
    if (touchStartX) {
      var touchDeltaX = event.touches[0].clientX - touchStartX;
      if (touchDeltaX > 0 || position < pictureCount - 1) {
        pictures.style.transform = 'translate(-' + (posToPx(position) - touchDeltaX) + 'px, 0)';
      }
    }
    event.preventDefault();
  }, {passive: false});

  pictures.addEventListener('touchend', function(event) {
    if (touchStartX) {
      var touchDeltaX = event.changedTouches[0].clientX - touchStartX;
      pictures.style.transition = '.5s';
      if (touchDeltaX < 0) moveTo(position + 1, '.3s ease-out');
      if (touchDeltaX > 0) moveTo(position - 1, '.3s ease-out');
      touchStartX = null;
    }
    event.preventDefault();
  }, {passive: false});

  // initial position
  moveTo(position);
}
