
'use strict';

function showLightbox(gallery, initialPosition) {
  gallery = select(gallery);

  // elements
  let lightbox = select('body > main').addElement('div', 'lightbox');
  let container = lightbox.addElement('div', 'lb-container');
  let viewport = container.addElement('div', 'lb-viewport');
  let pictures = viewport.addElement('div', 'lb-pictures');
  let closeButton = container.addElement('div', 'lb-button lb-close-button icon icon-24px icon-close');
  let prevButton = container.addElement('div', 'lb-button lb-prev-button icon icon-24px icon-chevron-left');
  let nextButton = container.addElement('div', 'lb-button lb-next-button icon icon-24px icon-chevron-right');

  lightbox.preventDefault(['touchmove', 'mousewheel']);

  // pictures
  let pictureCount = 0;
  let position = null;

  gallery.querySelectorAll('picture').forEach(function(original) {
    let copy = pictures.addElement('picture');

    Array.from(original.children).forEach(function(child) {
      let nodeName = child.nodeName.toLowerCase();

      if (nodeName == 'source' || nodeName == 'img') {
        copy.appendChild(child.cloneNode(true));
      }
    });
    pictureCount++;
  });

  // functions
  let posToPx = function(pos) {
    return pos * (viewport.offsetWidth + 8);
  };

  let moveToPicture = function(newPosition, transition) {
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
  };

  let moveToPreviousPicture = function() {
    moveToPicture(position - 1, '.6s');
  }

  let moveToNextPicture = function() {
    moveToPicture(position + 1, '.6s');
  }

  let closeLightbox = function() {
    lightbox.remove();
    window.removeEventListener('keyup', onKeyup);
    window.removeEventListener('resize', onResize);
  };

  // resize events
  let onResize = function(event) {
    moveToPicture(position, 'none');
  };
  window.addEventListener('resize', onResize);

  // key events
  let onKeyup = function(event) {
    switch (event.keyCode) {
      case 27: closeLightbox(); break;
      case 37: moveToPreviousPicture(); break;
      case 39: moveToNextPicture(); break;
    }
  };
  window.addEventListener('keyup', onKeyup);

  // click events
  closeButton.onclick = closeLightbox;
  prevButton.onclick = moveToPreviousPicture;
  nextButton.onclick = moveToNextPicture;

  // touch events
  let touchStartX = null;

  pictures.addEventListener('touchstart', function(event) {
    if (event.touches.length == 1) {
      touchStartX = event.touches[0].clientX;
      pictures.style.transition = 'none';
    }
    event.preventDefault();
  }, {passive: false});

  pictures.addEventListener('touchmove', function(event) {
    if (touchStartX) {
      let touchDeltaX = event.touches[0].clientX - touchStartX;
      if (touchDeltaX > 0 || position < pictureCount - 1) {
        pictures.style.transform = 'translate(-' + (posToPx(position) - touchDeltaX) + 'px, 0)';
      }
    }
    event.preventDefault();
  }, {passive: false});

  pictures.addEventListener('touchend', function(event) {
    if (touchStartX) {
      let touchDeltaX = event.changedTouches[0].clientX - touchStartX;
      pictures.style.transition = '.5s';
      if (touchDeltaX < 0) moveToPicture(position + 1, '.3s ease-out');
      if (touchDeltaX > 0) moveToPicture(position - 1, '.3s ease-out');
      touchStartX = null;
    }
    event.preventDefault();
  }, {passive: false});

  // move to initialize position
  moveToPicture(initialPosition, 'none');
}
