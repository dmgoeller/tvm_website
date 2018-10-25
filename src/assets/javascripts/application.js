
var preferences = {};

/**********************************************************************
 * prototypes
 **********************************************************************/

Array.prototype.first = function() {
  return this.length > 0 ? this[0] : null; 
}

Array.prototype.shuffle = function() {
  for (var i = this.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));

    // swap the elements at the i-th and j-th position
    var element = this[i];
    this[i] = this[j];
    this[j] = element;
  }
  return this;
}

Element.prototype.addElement = function(name, classes) {
  var element = document.createElement(name);
  element.className = classes;
  return this.appendChild(element);
}

Element.prototype.addText = function(text) {
  var textNode = document.createTextNode(text);
  return this.appendChild(textNode);
}

Element.prototype.removeChildren = function() {
  while (this.firstChild) {
    this.removeChild(this.firstChild);
  }
}

Element.prototype.show = function() {
  this.classList.remove('hidden');
}

Element.prototype.hide = function() {
  this.classList.add('hidden');
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

document.addEventListener('DOMContentLoaded', function() {
  // read app properties
  var attr = select('html').attributes;
  for (i = 0; i < attr.length; i++) {
    if (attr[i].name.startsWith('data-')) {
      preferences[attr[i].name.slice(5)] = attr[i].value;
    }
  }
  // set copyright year
  if (copyrightYear = select('#copyright-year')) {
    copyrightYear.addText((new Date()).getFullYear());
  }
  // load initial article
  var path = window.location.pathname;

  if (path.startsWith(preferences['base-path'])) {
    path = path.slice(preferences['base-path'].length);
  }
  if (path == '' || path == '/' || path == '/index.html') {
    path = preferences['index-page'];
  }
  loadArticle(path);
});

window.addEventListener('load', function() {
  preventDefault('#top-menu .menu-items', 'touchmove');
  preventDefault('#alert', 'touchmove');
  
  // browser history
  window.addEventListener('popstate', function(event) {
    if (event.state) {
      loadArticle(event.state['article'], {'ypos': event.state['ypos']});
    }
  });
  // service worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('service-worker.js')
      .then(function(registration) {
        console.log('Service worker registered for ' + registration.scope);
      })
      .catch(function(error) {
        console.log('Service worker registration failed:', error);
    });
  }
});

function preventDefault(element, eventType) {
  select(element).addEventListener(eventType, function(event) {
    event.preventDefault();
  }, {passive: false});
}

/**********************************************************************
 * page loading
 **********************************************************************/

function loadArticle(name, options = {}) {
  var topMenu = select('#top-menu');
  var glasspane = select('#glasspane');
  var caller = select(options['caller']);
  var ypos = options['ypos'] || 0;

  if (caller) caller.classList.add('loading');
  glasspane.show();

  fetch('articles/' + name + '.html', {timeout: 3000})
    .then(function(response) {
      var main = select('body > main');
      var article = null;
      var title = null;

      if (caller) caller.classList.remove('loading');
      topMenu.classList.remove('unfolded');
      glasspane.hide();

      if (history.state != null) {
        var state = {'article': history.state['article'], 'ypos': window.pageYOffset};
        history.replaceState(state, null, getPath(state['article']));
      }
      // display new article 
      main.innerHTML = response;
      article = main.querySelector('article');

      if (history.state == null || history.state['article'] != name) {
        var state = {'article': name, 'ypos': ypos};
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
      document.title = preferences['app-title'] + (title ? ' - ' + title : '');
      window.scrollTo(0, ypos);

      if (article) {
        buildImages(article);
        loadImages(Array.from(article.children));
      }
    })
    .catch(function(error) {
      if (caller) caller.classList.remove('loading');
      topMenu.classList.remove('unfolded');
      glasspane.hide();
      alert(error.message);
    });
}

function fetch(url, options = {}) {
  return new Promise(function(resolve, reject) {
    var request = new XMLHttpRequest();
    request.open('GET', url);
    request.timeout = options.timeout || 0;

    request.onreadystatechange = function() {
      if (request.readyState == 4 /*DONE*/) {
        if (request.status == 200) {
          resolve(request.responseText);
        } else
        if (request.status == 404) {
          reject(new Error('ERR_NOT_FOUND'));
        } else
        if (!navigator.onLine) {
          reject(new Error('ERR_DISCONNECTED'));
        } else {
          reject(new Error('ERR_FETCH_FAILED'));
        }
      }
    }
    request.send();
  });
}

function execute(expression) {
  var tokens = expression.split(" ");

  if (tokens.length > 0) {
    var func = window[tokens.first()];
    var args = tokens.slice(1);
    try {
      func.apply(null, args);
    } catch(e) {
      console.log(e);
    }
  }
}

function getPath(article) {
  return article == preferences['index-page'] ? '.' : article;
}

/**********************************************************************
 * lazy image loading
 **********************************************************************/

function buildImages(article) {
  article.querySelectorAll('*[data-image]').forEach(function(element) {
    // create image tag
    var image = element.addElement('img');
    image.setAttribute('data-src', element.getAttribute('data-image'));
    image.setAttribute('alt', element.getAttribute('data-alt') || '');

    // create loading indicator
    if (element.getAttribute('data-loading-indicator') == 'true') {
      element.addElement('div', 'loading-indicator delayed-fade-in')
        .addElement('div', 'spinner spinner-circle');
    }
  });
}

function loadImages(containers) {
  if (containers.length > 0) {
    var container = containers.first();
    var images = container.querySelectorAll('img[data-src]');
    var displayImagesAtOnce = container.getAttribute('data-display-images-at-once') == 'true';

    if (images.length > 0) {
      // load images in the current container
      var counter = 0;

      images.forEach(function(image) {
        image.onload = function() {
          if (!displayImagesAtOnce) imageLoaded(image);
          
          if (++counter >= images.length) {
            if (displayImagesAtOnce) images.forEach(imageLoaded);

            // load images in the next containers
            loadImages(containers.slice(1));
          }
        }
        image.setAttribute('src', image.getAttribute('data-src'));
      });
    } else {
      // load images in the next containers
      loadImages(containers.slice(1));
    }
  }
}

function imageLoaded(image) {
  var parent = image.parentNode;

  // remove the loading indicator for the image
  if (loadingIndicator = parent.querySelector('.loading-indicator')) {
    loadingIndicator.remove();
  }
  // remove the data-src attribute to display the image
  image.removeAttribute('data-src');

  // enable the parent's onclick function
  if (onClick = parent.getAttribute('data-onclick')) {
    parent.setAttribute('onclick', onClick);
    parent.removeAttribute('data-onclick');
  }
}

/**********************************************************************
 * onload handlers
 **********************************************************************/

function buildGalleries() {
  selectAll('.gallery').forEach(function(gallery) {
    var pictures = gallery.querySelectorAll('.picture');

    for (var i = 0; i < pictures.length; i++) {
      var onclick = 'showLightbox(this.parentNode, ' + i + ');';
      pictures[i].setAttribute('data-onclick', onclick);
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

function alert(msg) {
  var container = select('#alert .text');
  container.innerHTML = '';

  if (errorMessage = ERROR_MESSAGES[msg]) {
    if (message = errorMessage.message) {
      container.addElement('div', 'message').addText(message);
    }
    errorMessage.details.forEach(function(detail) {
      container.addElement('div', 'detail').addText(detail);
    });
  } else {
    container.addText(msg);
  }
  select('#alert').show();
}

/**********************************************************************
 * error messages
 **********************************************************************/

var ERROR_MESSAGES = {
  ERR_NOT_FOUND: {
    message: 'Upps!',
    details: [
      'Die gewünschte Seite existiert nicht.'
    ]
  },
  ERR_DISCONNECTED: {
    message: 'Keine Internetverbindung',
    details: [
      'Die gewünschte Seite kann im Moment nicht angezeigt werden.'
    ]
  },
  ERR_FETCH_FAILED: {
    message: 'Upps!',
    details: [
      'Die gewünschte Seite konnte nicht geladen werden.',
      'Bitte versuche es später noch einmal.'
    ]
  }
};
