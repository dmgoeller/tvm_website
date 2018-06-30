
/**********************************************************************
 * custom methods
 **********************************************************************/

Element.prototype.addElement = function(name, classes) {
  var element = document.createElement(name);
  element.className = classes;
  return this.appendChild(element);
}

Element.prototype.addText = function(text) {
  var textNode = document.createTextNode(text);
  return this.appendChild(textNode);
}

Element.prototype.setClass = function(className, condition) {
  if (condition) {
    this.classList.add(className);
  } else {
    this.classList.remove(className);
  }
}

Element.prototype.toggleClass = function(className) {
  this.classList.toggle(className);
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
  var params = new URLSearchParams(window.location.search);
  var page = params.get('page') || 'startseite';
  loadPage(page);
});

window.addEventListener('load', function() {
  preventDefault('#top-menu .menu-items', 'touchmove');
  preventDefault('#alert', 'touchmove');
  
  // browser history
  window.addEventListener('popstate', function(event) {
    if (event.state) {
      loadPage(event.state['page'], null, event.state['ypos']);
    }
  });
  // service worker
  if ('serviceWorker' in navigator) {
    if (window.matchMedia('(display-mode: standalone)').matches) {
      var serviceWorkerName = 'service-worker-standalone.js';
    } else {
      var serviceWorkerName = 'service-worker.js';
    }
    navigator.serviceWorker.register(serviceWorkerName)
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

function loadPage(page, caller = null, ypos = 0) {
  var topMenu = select('#top-menu');
  var glasspane = select('#glasspane');
  glasspane.show();

  caller = select(caller);
  if (caller) caller.setClass('loading', true);

  fetch('pages/' + page + '.html', {timeout: 3000})
    .then(function(response) {
      var main = select('body > main');
      var pageTitle = null;

      if (caller) caller.setClass('loading', false);
      topMenu.setClass('unfolded', false);
      glasspane.hide();

      // unload old page
      if (article = main.querySelector('*:first-child')) {
        if (pageonunload = article.getAttribute('data-page-onunload')) {
          execute(pageonunload);
        }
      }
      if (history.state != null) {
        var state = {'page': history.state['page'], 'ypos': window.pageYOffset};
        var url = 'index.html?page=' + state['page'];
        history.replaceState(state, null, url);
      }
      // display new page 
      main.innerHTML = response;
      window.scrollTo(0, ypos);

      if (article = main.querySelector('*:first-child')) {
        if (pageonload = article.getAttribute('data-page-onload')) {
          execute(pageonload);
        }
        pageTitle = article.getAttribute('data-page-title');
      }
      document.title = 'TV Melsbach' + (pageTitle != null ? ' - ' + pageTitle : '');

      if (history.state == null || history.state['page'] != page) {
        var state = {'page': page, 'ypos': ypos};
        var url = 'index.html?page=' + page;
        history.pushState(state, null, url);
      }
      loadImages(main);
    })
    .catch(function(error) {
      if (caller) caller.setClass('loading', false);
      topMenu.setClass('unfolded', false);
      glasspane.hide();
      alert(error.message);
    });
}

function loadImages(container) {
  // expand background images
  container.querySelectorAll('.background[data-image]').forEach(function(element) {
    element.addElement('img').setAttribute('data-src', element.getAttribute('data-image'));
  });
  // load images
  container.querySelectorAll('img[data-src]').forEach(function(img) {
    img.setAttribute('src', img.getAttribute('data-src'));

    img.onload = function() {
      var parent = img.parentNode;
      if (onClick = parent.getAttribute('data-onclick')) {
        parent.setAttribute('onclick', onClick);
        parent.removeAttribute('data-onclick');
      }
      img.removeAttribute('data-src');
    }
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

function execute(script) {
  try {
    window[script]();
  } catch(e) {
    console.log(e);
  }
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
