
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

Element.prototype.show = function() {
  this.classList.remove('hidden');
}

Element.prototype.hide = function() {
  this.classList.add('hidden');
}

Element.prototype.preventDefault = function(eventTypes) {
  eventTypes.forEach(function(eventType) {
    this.addEventListener(eventType, function(event) {
      event.preventDefault();
    }, {passive: false});
  });
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
  let attr = select('html').attributes;
  for (i = 0; i < attr.length; i++) {
    if (attr[i].name.startsWith('data-')) {
      applicationProperties[attr[i].name.slice(5)] = attr[i].value;
    }
  }
  // set copyright year
  if (copyrightYear = select('#copyright-year')) {
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
  //select('#nav').preventDefault(['touchmove', 'mousewheel']);
  //select('#alert').preventDefault(['touchmove', 'mousewheel']);

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

function loadArticle(name, options = {}) {
  let nav = select('#nav');
  let glasspane = select('#glasspane');
  let caller = select(options['caller']);
  let ypos = options['ypos'] || 0;

  if (caller) caller.classList.add('loading');
  glasspane.show();

  fetch('articles/' + name + '.html', {timeout: 3000})
    .then(function(response) {
      let main = select('body > main');
      let article = null;
      let title = null;

      if (caller) caller.classList.remove('loading');
      nav.classList.remove('top-menu-unfolded');
      glasspane.hide();

      if (history.state != null) {
        let state = {'article': history.state['article'], 'ypos': window.pageYOffset};
        history.replaceState(state, null, getPath(state['article']));
      }
      // display new article
      main.innerHTML = response;
      article = main.querySelector('article');

      if (history.state == null || history.state['article'] != name) {
        let state = {'article': name, 'ypos': ypos};
        if (history.state == null) {
          history.replaceState(state, null, getPath(name));
        } else {
          history.pushState(state, null, getPath(name));
        }
      }
      if (article) {
        if (articleonload = article.getAttribute('data-onload')) {
          execute(articleonload);
        }
        title = article.getAttribute('data-title');
      }
      document.title = applicationProperties['app-title'] + (title ? ' - ' + title : '');
      window.scrollTo(0, ypos);

      if (article) {
        buildImages(article);
        loadImages(Array.from(article.children));
      }
    })
    .catch(function(error) {
      if (caller) caller.classList.remove('loading');
      nav.classList.remove('top-menu-unfolded');
      glasspane.hide();
      alert(error);
    });
}

function fetch(url, options = {}) {
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

function getPath(article) {
  return article == applicationProperties['index-page'] ? '.' : article;
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
        element.addElement('div', 'loading-indicator').addElement('div', 'spinner');
        element.removeAttribute('data-loading-indicator');
      }
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

  // paint scaled images on a canvas element in Edge to use bicubic (high quality) interpolation
  if (navigator.userAgent.indexOf('Edge') >= 0 && image.getComputedStyle().objectFit == 'cover') {
    let canvas = document.createElement('canvas');
    canvas.height = image.naturalHeight;
    canvas.width = image.naturalWidth;
    canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);

    image.onload = null;
    image.src = canvas.toDataURL('image/jpg');
  }
  // remove the loading indicator tag
  let loadingIndicator = parent.querySelector('.loading-indicator');
  if (loadingIndicator) {
    loadingIndicator.remove();
  }
  // remove the 'data-lazy-loading' attribute to display the image
  image.removeAttribute('data-lazy-loading');

  // enable the parent's 'onclick' handler
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

function initCalendar() {
  let today = midnight(new Date());

  selectAll('.calendar .date').forEach(function(dateElement) {
    if (parseDate(dateElement.innerText) < today) {
      [
        dateElement.previousElementSibling,               // day-of-week
        dateElement,                                      // date
        dateElement.nextElementSibling,                   // time
        dateElement.nextElementSibling.nextElementSibling // text
      ].forEach(function(element) {
        element.classList.add('expired');
      });
    }
  });
}

function shuffleChildren(element) {
  element = select(element);

  children = Array.from(element.children);
  children.shuffle();

  element.removeChildren();

  children.forEach(function(child) {
    element.appendChild(child);
  });
}

/**********************************************************************
 * alerts
 **********************************************************************/

function alert(message) {
  let text = select('#alert .text');
  text.innerHTML = '';

  if (typeof message == 'object') {
    text.addElement('div', 'message').addText(message.message);
    message.details.forEach(function(detail) {
      text.addElement('div', 'detail').addText(detail);
    });
  } else {
    text.addText(message);
  }
  select('#alert').show();
}

