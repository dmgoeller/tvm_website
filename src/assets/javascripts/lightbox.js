
function showLightbox(gallery, position = 0) {
  gallery         = select(gallery);
  var lightbox    = gallery.addElement('div', 'lightbox');
  var container   = lightbox.addElement('div', 'lb-container');
  var viewport    = container.addElement('div', 'lb-viewport');
  var slides      = viewport.addElement('div', 'lb-slides');
  var closeButton = container.addElement('div', 'lb-button lb-close-button icon icon-close');
  var prevButton  = container.addElement('div', 'lb-button lb-prev-button icon icon-chevron-left');
  var nextButton  = container.addElement('div', 'lb-button lb-next-button icon icon-chevron-right');

  var posToPx = function(pos) {
    return pos * (viewport.offsetWidth + 8);
  }

  var moveTo = function(newPosition, transition = 'none') {
    position = Math.max(0, Math.min(slideCount - 1, newPosition));
    prevButton.setClass('disabled', position == 0);
    nextButton.setClass('disabled', position == slideCount - 1);
    slides.style.transition = transition;
    slides.style.transform = 'translate(-' + posToPx(position) + 'px, 0)';
  }

  // slides
  var slideCount  = 0;

  gallery.querySelectorAll('img').forEach(function(img) {
    if (src = img.getAttribute('src')) {
      slides.addElement('div', 'lb-slide').addElement('img').setAttribute('src', src);
      slideCount++;
    }
  });

  // button actions
  closeButton.onclick = function() { gallery.removeChild(lightbox); }  
  prevButton.onclick  = function() { moveTo(position - 1, '.6s'); } 
  nextButton.onclick  = function() { moveTo(position + 1, '.6s'); }

  // touch events
  var touchStartX = null;

  slides.addEventListener('touchstart', function(event) {
    if (event.touches.length == 1) {
      touchStartX = event.touches[0].clientX;
      slides.style.transition = 'none';
    }
    event.preventDefault();
  }, {passive: false});

  slides.addEventListener('touchmove', function(event) {
    if (touchStartX) {
      var touchDeltaX = event.touches[0].clientX - touchStartX;
      if (touchDeltaX > 0 || position < slideCount - 1) {
        slides.style.transform = 'translate(-' + (posToPx(position) - touchDeltaX) + 'px, 0)';
      }
    }
    event.preventDefault();
  }, {passive: false});

  slides.addEventListener('touchend', function(event) {
    if (touchStartX) {
      var touchDeltaX = event.changedTouches[0].clientX - touchStartX;
      slides.style.transition = '.5s';
      if (touchDeltaX < 0) moveTo(position + 1, '.3s ease-out');
      if (touchDeltaX > 0) moveTo(position - 1, '.3s ease-out');
      touchStartX = null;
    }
    event.preventDefault();
  }, {passive: false});

  // initial position
  moveTo(position);
}
