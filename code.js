/* Basic API for working with 3D vectors */

function Vector3(x, y, z){
  this.x = x || 0;
  this.y = y || 0;
  this.z = z || 0;
}

Vector3.prototype.add = function(vector) {
  return new Vector3(this.x + vector.x, this.y + vector.y, this.z + vector.z);
};

Vector3.prototype.times = function(scalar) {
  return new Vector3(scalar * this.x, scalar * this.y, scalar * this.z);
};

Vector3.prototype.subtract = function(vector) {
  return this.add(vector.times(-1));
};

Vector3.prototype.divide = function(scalar) {
  scalar = 1/scalar;
  return this.times(scalar);
};

Vector3.prototype.cross = function(vector) {
  var x = this.y * vector.z - this.z * vector.y;
  var y = this.z * vector.x - this.x * vector.z; 
  var z = this.x * vector.y - this.y * vector.x;
  return new Vector3(x, y, z); 
};

Vector3.prototype.normalize = function() {
  var norm = this.norm();
  return norm != 0 ? this.divide(this.norm()) : this;
};

Vector3.prototype.asArray = function() {
  return [this.x, this.y, this.z];
};

Vector3.prototype.inner = function(vector) {
  return this.x * vector.x + this.y * vector.y + this.z * vector.z;
};

Vector3.prototype.norm = function() {
  return Math.sqrt(this.inner(this));
};

Vector3.prototype.toString = function() {
  return "(" + this.x + ", " + this.y + ", " + this.z + ")"; 
};

Vector3.random = function(min, max) {
  while (true) {
    var vec = new Vector3(randBetween(min, max), randBetween(min, max), randBetween(min, max));
    if (vec.norm() >= 1) continue;
    return vec;  
  }
}

function randBetween(min, max) {
  return Math.random() * (max - min) + min; 
}

/* Ray Tracing Stuff */

function Ray(origin, direction) {
  // Origin and direction are both Vector3 objects
  this.origin = origin; // A
  this.direction = direction.normalize(); // b
}

Ray.prototype.at = function (t) {
  return this.origin.add(this.direction.times(t)); // at(t) = A + bt
};

// The main aspect of the ray tracing algorithm. Inputs a ray (which points from the eye to a pixel)
// and returns the color value for that pixel. The steps are as follows: 
// 1. Check if the ray collides with an object in the scene 
// 2. If it does, use the reflective properties of the object to compute the pixel color
// 3. If it doesn't just return the background color

// Called from renderScene to return color, or from computeColor for recursive ray tracing
function traceRay(ray, depth) {
  var intersection = closestIntersection(ray);
  if (!intersection.object) return scene.camera.background; 
  return computeColor(ray, intersection, depth);
}

function computeColor(ray, intersection, depth) {
  var object = intersection.object; 
  var color = object.material.color;
  var reflection = new Vector3(0, 0, 0);
  var lights = scene.lights;
  var rayIntPoint = ray.at(intersection.t);
  var surfaceNormal = object.normal(rayIntPoint);
  if (--depth < 1) return reflection;  
  
  // Apply Lambertian reflectance (diffuse)
  var lambertianScale = object.material.diffuse; 
  var lambertianAmount = 0; 
  if (lambertianScale > 0) {
    for (var i = 0; i < lights.length; i++) {
      var light = lights[i];
      if (light.visible(rayIntPoint, object)) {
        var L = light.position.subtract(rayIntPoint).normalize().inner(surfaceNormal) * light.intensity;
        lambertianAmount += Math.max(L, 0);
      }
    }
    lambertianAmount = Math.min(lambertianAmount, 1); // To not blow up the colors
    color.add(object.material.scatter(ray, intersection, depth)); // Scatter the light in a random direction for diffuse shading
  }
  
  // Apply specular reflection
  var specularScale = object.material.specular; 
  if (specularScale > 0) {
    var surfaceRay = new Ray(rayIntPoint, Material.reflect(ray.direction, surfaceNormal));
    reflection = traceRay(surfaceRay, depth).times(specularScale);
  }
  return reflection.add(color.times(lambertianAmount * lambertianScale)).add(color.times(object.material.ambient));
}

function closestIntersection(ray) {
  var objects = scene.objects; 
  var intersection = {object: null, t: Infinity};
  for (var i = 0; i < objects.length; i++) {
    var object = objects[i];
    var intersectSolution = object.checkIntersection(ray);
    if (intersectSolution < Infinity && intersection.t > intersectSolution) {
      intersection.object = object; 
      intersection.t = intersectSolution;
    }
  }
  return intersection; 
}

/* Object Material Properties */ 

function Material(diffuse, specular, ambient, color) {
  this.color = color || new Vector3(0, 0, 0);
  this.diffuse = diffuse || 0;
  this.specular = specular || 0; 
  this.ambient = ambient || 0; 
}

Material.prototype.scatter = function(ray, intersection, depth) {
  var p = ray.at(intersection.t);
  var hitNormal = intersection.object.normal(p).times(-1);
  var targ = hitNormal.add(Vector3.random(-1, 1));
  var r = new Ray(p, targ);
  return traceRay(r, depth); 
}

Material.reflect = function (v, normal) {
  // From https://en.wikipedia.org/wiki/Specular_reflection#Vector_formulation
  return v.subtract(normal.times(2*normal.inner(v)));
};

function Light(x, y, z, intensity, id) {
  this.position = new Vector3(x, y, z);
  this.intensity = intensity || 1; 
  this.id = id;
}

Light.prototype.visible = function(pos, object) {
  var intersection = closestIntersection(new Ray(this.position, pos.subtract(this.position))); 
  // To make sure we don't count intersection with the object with pos as a point, 
  // we add some tolerance. 
  return intersection.object == object && intersection.t > -scene.image.zero_tol; 
};

/* Objects */

function Sphere(x, y, z, radius, material, id) {
  this.position = new Vector3(x, y, z);
  this.radius = radius || 0; 
  this.material = material || new Material();
  this.id = id;
}

Sphere.prototype.normal = function(pos) {
  return pos.subtract(this.position).normalize();
};

Sphere.prototype.checkIntersection = function(ray) {
  // There is a clever way to check this intersection which comes from the quadratic formula
  // The sphere equation is (x - C_x)^2 + (y - C_y)^2 + (z - C_z)^2 = r^2, where C is the center vector
  // for the sphere . We are trying to see if there exists some t such that the x, y, and z components
  // of ray.at(t) = A + bt satisfy the above equation.
  
  // To do this, we can rewrite this as <(A + bt - C), (A + bt - C)> = r^2. Set A - C = O and we have 
  // <O + bt, O + bt> - r^2 = <O, O> + 2t<O, b> + t^2<b, b> - r^2 = 0
  
  // So we can first check if there is a real solution for t by checking that B^2 - 4ac >= 0,
  // where c = <O, O> - r^2, B = 2<O, b>, and a = <b, b>
  
  var A = ray.origin;
  var r = ray.direction;
  var O = A.subtract(this.position);
  var a = 1 // r.inner(r) = 1 since we normalize it;
  var b = 2 * O.inner(r);
  var c = O.inner(O) - this.radius*this.radius;
  var discriminant = b*b - 4*a*c;
  
  // Return the smallest positive (real) solution to quadratic equation while making sure that the sphere 
  // isn't intersecting itself with it's reflections 
  
  // To do this, we will first ensure that the discriminant is bigger than 0, otherwise it is clear that 
  // there are no real solutions. Now we encounter the issue of loss of accuracy in our computations due to 
  // floating point numbers. To combat this, it is standard to write
  // -b + sqrt(b^2-4ac)/2a = -4ac/(-2a*(b + sqrt(b^2-4ac))) = 2c/(b + sqrt(b^2-4ac))
  // Setting num = (-b + Math.sign(b) * sqrt(b^2-4ac)), we easily receive 
  // x_1 = num / a and x_2 = c / num
  
  if (discriminant >= 0) {
    var sqrtDisc = Math.sqrt(discriminant);
    var num = (b  < 0 ? -b - sqrtDisc : -b + sqrtDisc) / 2;
    var t_0 = num / a; // Normal quadratic formula
    var t_1 = c / num;
    
    // We now just take the smallest positive solution
    t_0 = Math.min(t_0, t_1), t_1 = Math.max(t_0, t_1);
    if (t_1 >= scene.image.zero_tol) {
      return t_0 < 0 ? t_1 : t_0;
    }
  }
  return Infinity;
};

function Plane(x, y, z, normal, material, id) {
  this.position = new Vector3(x, y, z); 
  this.normalVec = normal || new Vector3(0, 0, 0);
  this.material = material || new Material();
  this.id = id;
}

Plane.prototype.normal = function(pos) {
  return this.normalVec;
};

Plane.prototype.checkIntersection = function(ray) {
  var A = ray.origin;
  var b = ray.direction;
  var normal = this.normal();
  var denominator = normal.inner(b);
  
  // First, make sure the denominator is far enough from zero. This is to
  // (1) make sure we aren't dividing by zero
  // (2) make sure a reflected ray from the plane isn't intersecting itself.
  if (Math.abs(denominator) < scene.image.zero_tol) return Infinity;
  
  // We are trying to see if a solution exists to <n, A + bt - p> = 0, where p is the position of the plane
  // n is the plane normal (see the equation of a 3D plane given its normal). Rewriting, we get:
  // t<n, b> + <n, A> - <n, p> = 0 <=> t = (<n, p - A>)/<n, b>)
  
  var t = this.position.subtract(A).inner(normal) / denominator;
  return t > scene.image.zero_tol ? t : Infinity;
};

/* Render Scene */

var scene = {
  lights: [new Light(0, 4, -2, 1, "top light")],
  objects: [new Plane(0, -0.2, 1, new Vector3(0, 1, 0), new Material(0.7, 0.1, 0.5, new Vector3(61, 62, 64)), "floor"),
            new Sphere(0.1, -0.145, 1.4, 0.055, new Material(0.05, 0.3, 0.5, new Vector3(175, 250, 201)), "1st row ball 1"),
            new Sphere(0, -0.145, 1.4, 0.055, new Material(0.05, 0.3, 0.5, new Vector3(245, 175, 250)), "2nd row ball 2"),
            new Sphere(-0.1, -0.145, 1.4, 0.055, new Material(0.05, 0.3, 0.5, new Vector3(250, 110, 129)), "1st row ball 3"),
            new Sphere(0.05, -0.145, 1.3, 0.055, new Material(0.05, 0.3, 0.5, new Vector3(110, 115, 250)), "2nd row ball 1"),
            new Sphere(-0.05, -0.145, 1.3, 0.055, new Material(0.05, 0.3, 0.5, new Vector3(161, 116, 112)), "2nd row ball 2"),
            new Sphere(0, -0.145, 1.2, 0.055, new Material(0.05, 0.1, 0.5, new Vector3(245, 203, 86)), "3rd row ball 1"),
            new Sphere(0, -0.02, 1.3, 0.055, new Material(0.2, 0.7, 0.5, new Vector3(20, 20, 20)), "top mirror sphere")],
  camera: {
    pos: new Vector3(0, 0, 0),
    direction: new Vector3(0, 0, 1),
    fov: 40,
    up: new Vector3(0, 1, 0),
    antialiasing_samples_per_pixel: 1,
    ray_tracing_depth: 3,
    background: new Vector3(0, 0, 0),
  },
  image: {
    width: 320, 
    height: 450,
    scale: 1,
    zero_tol: 1e-3
  }
};

var eye;

function renderScene(rayTraceDepth) {
  var start = getTime();
  var camera = scene.camera;
  var width = scene.image.width * scene.image.scale;
  var height = scene.image.height * scene.image.scale; 
  
  // The viewport dimensions can be determined by the camera's FOV and the aspect ratio of the screen
  var aspectRatio = width / height;
  var viewportWidth = 2 * Math.tan(camera.fov * Math.PI / 360);
  var viewportHeight = viewportWidth / aspectRatio;
  
  var eye = camera.direction.subtract(camera.pos).normalize();
  var camVecX = eye.cross(camera.up).normalize(); // Camera X axis
  var camVecY = camVecX.cross(eye).normalize(); // Camera Y axis
  var topLeft = eye.subtract(camVecX.times(viewportWidth / 2)).add(camVecY.times(viewportHeight / 2));
  var pixelHeight = viewportHeight / (height - 1);
  var pixelWidth = viewportWidth / (width - 1);
  
  var sampleCount = camera.antialiasing_samples_per_pixel;

  // Create the canvas (in the sense of HTML5) for rendering
  if (renderCount > 0) { clearCanvas(); }
  createCanvas('renderArea' + renderCount, width, height);
  setActiveCanvas('renderArea' + renderCount);
  var imageData = getImageData(0, 0, width, height);
  
  // Loop through each canvas on each pixel and determine the color of that pixel by tracing a ray 
  // starting at the camera position pointing in the direction of the pixel.
  for (var y = 0; y < height; y++) {
    for (var x = 0; x < width; x++) {
      var incY = y * pixelHeight;
      var incX = x * pixelWidth; 
      var color = new Vector3(0, 0, 0); 
      
      // Sample multiple rays per pixel at random offsets for antialiasing
      for (var i = 0; i < sampleCount; i++) {
        var direction = topLeft.add(camVecX.times(incX)).subtract(camVecY.times(incY));
        var ray = new Ray(camera.pos, direction);
        color = color.add(traceRay(ray, rayTraceDepth));
        var sign = Math.pow(-1, i);
        incY += sign * Math.random() * pixelHeight;
        incX += sign * Math.random() * pixelWidth; 
      }
      color = color.divide(sampleCount);
      setRGB(imageData, x, y, color.x, color.y, color.z);
    }
    
    // Print the algorithm's progress, determined (somewhat misleadingly) by the number of remaining scanlines
    var progByScanLine = function(j) {
      return Math.floor(100 * j / Math.ceil(height - 1));
    };
    var currentProgress = progByScanLine(y);
    if (progByScanLine(y - 1) != currentProgress)
      console.log("Progress: " + currentProgress + "%")
      setText("progressBox", currentProgress + "%");
    
    // Update the RBG values (this would technically go outside of the loop, but it looks cooler)  
    putImageData(imageData, 0, 0);
  }
  console.log("Render Time: " + (getTime() - start) / 1000 + " s");
  hideElement("progressBox");
}

/* --- GUI APPLICATION --- */

// Code here is horrendous... try not to look

var rendering = false;
var objProps = {}; 
var renderCount = 0; 

var objectTypes = {
  Plane: Plane,
  Sphere: Sphere,
  Light: Light
};

function initializeBuilder(index) {
  setProperty("newObjectSelector", "options", Object.keys(objectTypes)); // Load object types
  
  // Load the default scene
  setProperty("objectSelector", "options", scene.lights.concat(scene.objects).map(function(e) {return e.id}));
  if (index) setProperty("objectSelector", "index", index);
  loadObjectProperties(); // Load the properties for the currently selected object
}

function loadCameraSettings() {
  var cam = scene.camera; 
  var img = scene.image; 
  
  setNumber("camPosXInp", cam.pos.x);
  setNumber("camPosYInp", cam.pos.y);
  setNumber("camPosZInp", cam.pos.z);
  
  setNumber("camDirXInp", cam.direction.x);
  setNumber("camDirYInp", cam.direction.y);
  setNumber("camDirZInp", cam.direction.z);
  
  setNumber("upDirXInp", cam.up.x);
  setNumber("upDirYInp", cam.up.y);
  setNumber("upDirZInp", cam.up.z);
  
  setNumber("bgColorR", cam.background.x);
  setNumber("bgColorG", cam.background.y);
  setNumber("bgColorB", cam.background.z);
  
  setProperty("fovSlider", "value", cam.fov);
  setProperty("rtDepthSlider", "value", cam.ray_tracing_depth);
  setProperty("ssaaSlider", "value", cam.antialiasing_samples_per_pixel > 1 ? cam.antialiasing_samples_per_pixel : 0);
  
  setNumber("fovDisplay", cam.fov);
  setNumber("rtDepthDisplay", cam.ray_tracing_depth); 
  setText("ssaaDisplay", cam.antialiasing_samples_per_pixel > 1 ? cam.antialiasing_samples_per_pixel : "OFF");
  
  setNumber("imgWidthInp", img.width);
  setNumber("imgHeightInp", img.height);
  setNumber("imgScaleInp", img.scale);
}

function loadObjectProperties(object) {
  object = object || scene.lights.concat(scene.objects)[getProperty("objectSelector", "index")];
  objProps = {}; // Reset object-specific properties 
  
  if (!object) return;
  
  // Load object position 
  setText("xInp", object.position.x);
  setText("yInp", object.position.y);
  setText("zInp", object.position.z);
  var keys = Object.keys(object); 
  
  // Position and material are not object-specific, so we ignore them
  var ignoreIndices = [keys.indexOf("position"), keys.indexOf("material")];
  for (var i in ignoreIndices) {
    if (i > -1) keys.splice(i, 1); 
  }
  
  // Load the properties based on the property that is being set
  setProperty("propsDropdown", "options", keys); 
  loadPropsDropdown();
  
  // Note: not all objects have material properties (e.g. lights).
  if (object.material) {
    setText("diffuseInp", object.material.diffuse);
    setText("specularInp", object.material.specular);
    setText("ambientInp", object.material.ambient);
    setText("rInp", object.material.color.x);
    setText("gInp", object.material.color.y);
    setText("bInp", object.material.color.z);
  } else {
    setText("diffuseInp", "");
    setText("specularInp", "");
    setText("ambientInp", "");
    setText("rInp", "");
    setText("gInp", "");
    setText("bInp", "");
  }
}

function loadPropsDropdown() {
  // Show vector input or text input, depending on the property
  var prop = getProperty("propsDropdown", "options")[getProperty("propsDropdown", "index")]; 
  var storedValue = objProps[prop];
  var value = storedValue ? storedValue : scene.lights.concat(scene.objects)[getProperty("objectSelector", "index")][prop];
  if (value.x !== undefined && value.y !== undefined && value.z !== undefined) {
    hideElement("propValue");
    setProperty("propsDropdown", "width", 100);
    showElement("propXInp");
    showElement("propYInp");
    showElement("propZInp");
    setText("propXInp", value.x);
    setText("propYInp", value.y);
    setText("propZInp", value.z);
  } else {
    hideElement("propXInp");
    hideElement("propYInp");
    hideElement("propZInp");
    showElement("propValue");
    setProperty("propsDropdown", "width", 185);
    setText("propValue", value);
  }
}

function objectOfIndex(i) {
  i = i || getProperty("objectSelector", "index");
  return {list: i > scene.lights.length - 1 ? scene.objects : scene.lights, 
          index: i > scene.lights.length - 1 ? i - scene.lights.length : i};
}

function saveVectorLocally() {
  objProps[getProperty("propsDropdown", "options")[getProperty("propsDropdown", "index")]] = new Vector3(getNumber("propXInp"), getNumber("propYInp"), getNumber("propZInp"));
}

initializeBuilder();
loadCameraSettings();

onEvent("objectSelector", "change", function() {
  loadObjectProperties(scene.lights.concat(scene.objects)[getProperty("objectSelector", "index")]);
});

onEvent("propValue", "change", function() {
  // Parse value as number if possible, otherwise interpret as text. 
  var value = parseFloat(getText("propValue")); 
  objProps[getProperty("propsDropdown", "options")[getProperty("propsDropdown", "index")]] = value < Infinity ? value : getText("propValue");
});

onEvent("propXInp", "change", saveVectorLocally);
onEvent("propYInp", "change", saveVectorLocally);
onEvent("propZInp", "change", saveVectorLocally);
onEvent("propsDropdown", "change", loadPropsDropdown);

onEvent("renderBtn", "click", function() {
  setScreen("Render");
  // Running multiple renders at once is a great way to destroy this browser tab, so we add this just to be very sure
  if (!rendering) {
    rendering = true; 
    renderScene(scene.camera.ray_tracing_depth);
    renderCount++; 
    rendering = false; 
  }
});

onEvent("removeBtn", "click", function() {
  var object = objectOfIndex();
  object.list.splice(object.index, 1);
  initializeBuilder(0);
});

onEvent("saveBtn", "click", function() {
  var objects = objectOfIndex();
  var obj = objects.list[objects.index];
  obj.position.x = getNumber("xInp");
  obj.position.y = getNumber("yInp");
  obj.position.z = getNumber("zInp");
  
  Object.keys(objProps).forEach(function(key) {
    obj[key] = objProps[key];
  });
  
  if (obj.material) {
    obj.material.diffuse = getNumber("diffuseInp");
    obj.material.specular = getNumber("specularInp");
    obj.material.ambient = getNumber("ambientInp");
    obj.material.color = new Vector3(getNumber("rInp"), getNumber("gInp"), getNumber("bInp"));
  }
});

onEvent("addBtn", "click", function() {
  var objectName = Object.keys(objectTypes)[getProperty("newObjectSelector", "index")];
  var emptyObject = new objectTypes[objectName]();
  emptyObject.id = objectName;
  var i = 0;
  if (emptyObject instanceof Light) {
    i = scene.lights.length; 
    appendItem(scene.lights, emptyObject);
  } else {
    i = scene.lights.length + scene.objects.length;
    appendItem(scene.objects, emptyObject);
  }
  initializeBuilder(i);
});

onEvent("fovSlider", "change", function() {
  setNumber("fovDisplay", getProperty("fovSlider", "value"));
});

onEvent("rtDepthSlider", "change", function() {
  setNumber("rtDepthDisplay", getProperty("rtDepthSlider", "value"));
});

onEvent("ssaaSlider", "change", function() {
  setText("ssaaDisplay", getProperty("ssaaSlider", "value") > 1 ? getProperty("ssaaSlider", "value") : "OFF");
});

onEvent("fovDisplay", "change", function() {
  setProperty("fovSlider", "value", getText("fovDisplay"));
});

onEvent("renderSaveBtn", "click", function() {
  var cam = scene.camera; 
  var img = scene.image; 
  
  cam.pos.x = getNumber("camPosXInp");
  cam.pos.y = getNumber("camPosYInp");
  cam.pos.z = getNumber("camPosZInp");
  
  cam.direction.x = getNumber("camDirXInp");
  cam.direction.y = getNumber("camDirYInp");
  cam.direction.z = getNumber("camDirZInp");
  
  cam.up.x = getNumber("upDirXInp");
  cam.up.y = getNumber("upDirYInp");
  cam.up.z = getNumber("upDirZInp");
  
  cam.background.x = getNumber("bgColorR");
  cam.background.y = getNumber("bgColorG");
  cam.background.z = getNumber("bgColorB");
  
  cam.fov = getNumber("fovDisplay");
  cam.ray_tracing_depth = getNumber("rtDepthDisplay"); 
  cam.antialiasing_samples_per_pixel = getNumber("ssaaDisplay") > 0 ? getNumber("ssaaDisplay") : 1; 
  
  img.width = getNumber("imgWidthInp");
  img.height = getNumber("imgHeightInp");
  img.scale = getNumber("imgScaleInp");
});

onEvent("rtDepthDisplay", "change", function() {
  setProperty("rtDepthSlider", "value", getText("rtDepthDisplay"));
});

onEvent("renderOptionsBtn", "click", function() {
  setScreen("RenderOptions");
});

onEvent("renderExitBtn", "click", function() {
  setScreen("SceneBuilder");
});

onEvent("renderBackBtn", "click", function() {
  setScreen("SceneBuilder");
});