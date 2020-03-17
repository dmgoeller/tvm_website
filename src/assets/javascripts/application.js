
'use strict';

/**********************************************************************
 * prototypes
 **********************************************************************/

Array.prototype.first = function() {
  return this.length > 0 ? this[0] : null;
}

Array.prototype.swap = function(i, j) {
  let element = this[i];
  this[i] = this[j];
  this[j] = element;
  return this;
}

Array.prototype.shuffle = function() {
  for (let i = this.length - 1; i > 0; i--) {
    this.swap(i, Math.floor(Math.random() * (i + 1)));
  }
  return this;
}

Element.prototype.addElement = function(name, classes) {
  let element = document.createElement(name);
  element.className = classes;
  return this.appendChild(element);
}

Element.prototype.addText = function(text) {
  let textNode = document.createTextNode(text);
  return this.appendChild(textNode);
}

Element.prototype.removeChildren = function() {
  while (this.firstChild) {
    this.removeChild(this.firstChild);
  }
}

Element.prototype.getComputedStyle = function() {
  return window.getComputedStyle(this);
}

Element.prototype.preventDefault = function(eventTypes) {
  let element = this;

  eventTypes.forEach(function(eventType) {
    element.addEventListener(eventType, function(event) {
      event.preventDefault();
    }, {passive: false});
  });
}

Element.prototype.setIcon = function(name, height = 24, width = 24) {
  this.innerHTML = '<svg height="' + height + '" width="' + width + 
                   '"><use href="#' + name + '-icon"/></svg>';
  return this;
}

/**********************************************************************
 * date functions
 **********************************************************************/

function midnight(date) {
  let midnight = new Date(date.valueOf());
  midnight.setHours(0, 0, 0, 0);
  return midnight;
}

function parseDate(s) {
  return midnight(new Date(       // dd.mm.yyyy
    parseInt(s.substr(6, 4)),     // year
    parseInt(s.substr(3, 2)) - 1, // month (0-based)
    parseInt(s.substr(0, 2))      // day of month
  ));
}

/**********************************************************************
 * query selectors
 **********************************************************************/

function select(element) {
  if (typeof element == 'string') {
    return document.querySelector(element);
  } else {
    return element;
  }
}

function selectAll(elements) {
  if (typeof elements == 'string') {
    return document.querySelectorAll(elements);
  } else {
    return elements;
  }
}

/**********************************************************************
 * event listeners
 **********************************************************************/

var applicationProperties = {}; // base path, title etc.

document.addEventListener('DOMContentLoaded', function() {
  // read application properties
  Array.from(select('html').attributes).forEach(function(attribute) {
    if (attribute.name.startsWith('data-app-')) {
      applicationProperties[attribute.name.slice(9)] = attribute.value;
    }
  });
  // set copyright year
  let copyrightYear = select('#copyright-year');

  if (copyrightYear) {
    copyrightYear.addText((new Date()).getFullYear());
  }
  // load initial article
  let path = window.location.pathname;

  if (path.startsWith(applicationProperties['base-path'])) {
    path = path.slice(applicationProperties['base-path'].length);
  }
  if (path.startsWith('/')) {
    path = path.slice(1);
  }
  if (path == '' || path == 'index.html') {
    path = applicationProperties['index-page'];
  }
  loadArticle(path);
});

window.addEventListener('load', function() {
  // browser history
  window.addEventListener('popstate', function(event) {
    if (event.state) {
      loadArticle(event.state['article'], {'ypos': event.state['ypos']});
    }
  });
  // register service worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('service-worker.js')
      .then(function(registration) {
        console.log('Service worker registered for ', registration.scope);
      })
      .catch(function(error) {
        console.log('Service worker registration failed:', error);
    });
  }
});

window.addEventListener('scroll', function(event) {
  selectAll('.parallax').forEach(function(element) {
    element.style.top = Math.max((0.5 * window.pageYOffset), 0) + 'px';
  });
});

/**********************************************************************
 * article loading
 **********************************************************************/

function getArticlePath(name) {
  return name == applicationProperties['index-page'] ? '.' : name;
}

function getCanonicalURL(name) {
  let canonicalURL= applicationProperties['canonical-path'];

  if (name != applicationProperties['index-page']) {
    canonicalURL += '/' + name;
  }
  return canonicalURL;
}

function loadArticle(name, options) {
  options = options || {};
  let ypos = options['ypos'] || 0;

  let body = select('body');
  let header = body.querySelector('header');
  let loadingIndicator = body.addElement('div', 'article-loading-indicator');

  fetchResource('articles/' + name + '.html', {timeout: 5000})
    .then(function(response) {
      let main = body.querySelector('main');
      let article = null;

      header.classList.remove('app-menu-unfolded');
      
      if (history.state != null) {
        let state = {'article': history.state['article'], 'ypos': window.pageYOffset};
        history.replaceState(state, null, getArticlePath(state['article']));
      }
      // display new article
      main.innerHTML = response;
      article = main.querySelector('article');

      if (history.state == null || history.state['article'] != name) {
        let state = {'article': name, 'ypos': ypos};
        if (history.state == null) {
          history.replaceState(state, null, getArticlePath(name));
        } else {
          history.pushState(state, null, getArticlePath(name));
        }
      }
      if (article) {
        let articleOnload = article.getAttribute('data-onload');
        if (articleOnload) execute(articleOnload);

        let title = article.getAttribute('data-title');
        document.title = applicationProperties['title'] + (title ? ' - ' + title : '');

        let metaDescriptionTag = select('head > meta[name="description"]');
        if (metaDescriptionTag) {
          let description = article.getAttribute('data-description') || '';
          metaDescriptionTag.setAttribute('content', description);
        }
        let canonicalTag = select('head > link[rel="canonical"]');
        if (canonicalTag) canonicalTag.setAttribute('href', getCanonicalURL(name));

        window.scrollTo(0, ypos);

        buildImages(article);
        loadImages(Array.from(article.children));
      } else {
        document.title = applicationProperties['title'];
        window.scrollTo(0, 0);
      }
      loadingIndicator.remove();
    })
    .catch(function(error) {
      header.classList.remove('app-menu-unfolded');
      loadingIndicator.remove();
      alert(error);
    });
}

function fetchResource(url, options) {
  options = options || {};

  return new Promise(function(resolve, reject) {
    let request = new XMLHttpRequest();
    request.open('GET', url);
    request.timeout = options.timeout || 0;

    request.onreadystatechange = function() {
      if (request.readyState == 4 /*DONE*/) {
        if (request.status == 200) {
          resolve(request.responseText);
        } else
        if (request.status == 404) {
          reject({
            message: 'Upps!',
            details: [
              'Die gewünschte Seite existiert nicht.'
            ]
          });
        } else
        if (!navigator.onLine) {
          reject({
            message: 'Keine Internetverbindung',
            details: [
              'Die gewünschte Seite kann im Moment nicht angezeigt werden.'
            ]
          });
        } else {
          reject({
            message: 'Upps!',
            details: [
              'Die gewünschte Seite konnte nicht geladen werden.',
              'Bitte versuche es später noch einmal.'
            ]
          });
        }
      }
    }
    request.send();
  });
}

function execute(expression) {
  let tokens = expression.split(" ");

  if (tokens.length > 0) {
    let func = window[tokens.first()];
    let args = tokens.slice(1);
    try {
      func.apply(null, args);
    } catch(e) {
      console.log(e);
    }
  }
}

/**********************************************************************
 * lazy image loading
 **********************************************************************/

let loadedImages = []; // holds the images that have already been loaded

function buildImages(container) {
  container.querySelectorAll('[data-image]').forEach(function(element) {
    let src = element.getAttribute('data-image');

    // create nested source tags for full HD images
    if (element.tagName.toLowerCase() == 'picture' && src.endsWith('-1920x1080.jpg')) {
      // large devices
      let source = element.addElement('source');
      source.setAttribute('media', '(min-device-width: 768px)');
      source.setAttribute('srcset', src);

      // small devices
      source = element.addElement('source');
      source.setAttribute('media', '(max-device-width: 767px)');
      source.setAttribute('srcset', src.slice(0, -14) + '-960x540.jpg');

      // Note: Firefox ignores the image tag's 'src' attribute if at least one source tag is
      // present. Thus, the source for large devices must also be defined by a source tag.
    }
    // create a nested image tag
    let image = element.addElement('img');
    image.setAttribute('data-src', src);
    image.setAttribute('alt', element.getAttribute('data-alt') || '');

    // add a data-lazy-loading attribute if the image hasn't been loaded yet
    if (!loadedImages.includes(src)) {
      image.setAttribute('data-lazy-loading', '');

      // add a loading indicator tag
      if (element.hasAttribute('data-loading-indicator')) {
        element.addElement('div', 'image-loading-indicator').addElement('div', 'spinner');
        element.removeAttribute('data-loading-indicator');
      }
    }
    // set image position
    let imagePosition = element.getAttribute('data-image-position');
    if (imagePosition) {
      image.style.objectPosition = imagePosition;
      element.style.backgroundPosition = imagePosition;
      element.removeAttribute('data-image-position');
    }
    // remove 'data-' attributes
    element.removeAttribute('data-image');
    element.removeAttribute('data-alt');
  });
}

function loadImages(containers) {
  if (containers.length > 0) {
    let container = containers.first();
    let images = container.querySelectorAll('img[data-src]');

    if (images.length > 0) {
      let counter = 0;

      images.forEach(function(image) {
        image.onload = function() {
          if (container.hasAttribute('data-display-images-immediately')) {
            imageLoaded(image);
          }
          if (++counter >= images.length) {
            if (!container.hasAttribute('data-display-images-immediately')) {
              images.forEach(imageLoaded);
            }
            // load images in the next containers
            loadImages(containers.slice(1));
          }
        }
        image.src = image.getAttribute('data-src');
        image.removeAttribute('data-src');
      });
    } else {
      // load images in the next containers
      loadImages(containers.slice(1));
    }
    container.removeAttribute('data-display-images-immediately');
  }
}

function imageLoaded(image) {
  let src = image.src
  let parent = image.parentNode;

  // Edge: paint scaled images on a canvas element to use bicubic interpolation (high quality)
  if (navigator.userAgent.indexOf('Edge') >= 0 && image.getComputedStyle().objectFit == 'cover') {
    let canvas = document.createElement('canvas');
    canvas.height = image.naturalHeight;
    canvas.width = image.naturalWidth;
    canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);

    image.onload = null;
    image.src = canvas.toDataURL('image/jpg');
  }
  // remove the loading indicator element
  let loadingIndicator = parent.querySelector('.image-loading-indicator');
  if (loadingIndicator) {
    loadingIndicator.remove();
  }
  // remove the 'data-lazy-loading' attribute to display the image
  image.removeAttribute('data-lazy-loading');

  // enable the parent element's 'onclick' handler
  let onclick = parent.getAttribute('data-onclick');
  if (onclick) {
    parent.setAttribute('onclick', onclick);
    parent.removeAttribute('data-onclick');
  }
  // remember that the given image has been loaded
  if (!loadedImages.includes(src)) {
    loadedImages.push(src);
  }
}

/**********************************************************************
 * onload handlers
 **********************************************************************/

function initGalleries() {
  selectAll('.gallery').forEach(function(gallery) {
    let pictures = gallery.querySelectorAll('picture');

    for (let i = 0; i < pictures.length; i++) {
      let onclick = 'showLightbox(this.parentNode, ' + i + ');';
      pictures[i].setAttribute('data-onclick', onclick);
    }
  });
}

function shuffleChildren(element) {
  element = select(element);

  let children = Array.from(element.children);
  children.shuffle();

  element.removeChildren();

  children.forEach(function(child) {
    element.appendChild(child);
  });
}

/**********************************************************************
 * lightboxes
 **********************************************************************/

function showLightbox(gallery, initialPosition) {
  gallery = select(gallery);

  // elements
  let lightbox = select('article').addElement('div', 'lightbox');
  let viewport = lightbox.addElement('div', 'lb-viewport');
  let pictures = viewport.addElement('div', 'lb-pictures');
  let closeButton = lightbox.addElement('div', 'lb-button lb-close-button').setIcon('close');
  let prevButton = lightbox.addElement('div', 'lb-button lb-prev-button').setIcon('chevron-left');
  let nextButton = lightbox.addElement('div', 'lb-button lb-next-button').setIcon('chevron-right');

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

/**********************************************************************
 * alerts
 **********************************************************************/

function alert(message) {
  let scrim = select('body').addElement('div', 'dialog-scrim');
  let dialog = scrim.addElement('div', 'dialog-container');

  if (typeof message == 'object') {
    if (message.message) {
      dialog.addElement('div', 'title').addText(message.message);
    }
    if (message.details) {
      let text = dialog.addElement('div', 'text');

      message.details.forEach(function(detail) {
        text.addElement('p').addText(detail);
      });
    }
  } else {
    dialog.addElement('div', 'text').addElement('p').addText(message);
  }
  let actions = dialog.addElement('div', 'actions');
  let closeButton = actions.addElement('div', 'text-button');
  closeButton.addText('Ok');
  closeButton.addEventListener('click', function() { scrim.remove(); });
}

/**********************************************************************
 * external links
 **********************************************************************/

function openTeamLink(team_id, year) {
  window.open(
    'http://tvrp.liga.nu/cgi-bin/WebObjects/nuLigaTENDE.woa/wa/teamPortrait' + 
    '?team=' + team_id + 
    '&championship=RL+' + year
  );
}
