(() => {
  'use strict';

  // Public Supabase browser credentials. The publishable key is intentionally safe
  // to expose in a public frontend; access is restricted by Row Level Security.
  const SUPABASE_URL = 'https://metsgwspqdedgefycblu.supabase.co';
  const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_p7IT7-E-_MVJhwBEoiLPWw_40Jloan2';
  const MODEL_ID = 'elhovo-16';
  const MODEL_TITLE = 'Elhovo-16';
  const STORAGE_BUCKET = 'annotation-images';

  const $ = (id) => document.getElementById(id);

  const loadState = $('loadState');
  const syncState = $('syncState');
  const measureBtn = $('measureBtn');
  const areaBtn = $('areaBtn');
  const noteBtn = $('noteBtn');
  const notesLayerBtn = $('notesLayerBtn');
  const panelBtn = $('panelBtn');
  const clearBtn = $('clearBtn');
  const buildingBtn = $('buildingBtn');
  const viewsBtn = $('viewsBtn');
  const viewsPanel = $('viewsPanel');
  const cropBuildingToggle = $('cropBuildingToggle');
  const homeBtn = $('homeBtn');
  const interactionHint = $('interactionHint');
  const toast = $('toast');
  const container = $('cesiumContainer');

  const notesPanel = $('notesPanel');
  const closePanelBtn = $('closePanelBtn');
  const notesList = $('notesList');
  const noteCount = $('noteCount');
  const searchInput = $('searchInput');
  const statusFilter = $('statusFilter');
  const authorFilter = $('authorFilter');
  const exportExcelBtn = $('exportExcelBtn');
  const exportPdfBtn = $('exportPdfBtn');
  const refreshBtn = $('refreshBtn');

  const noteModal = $('noteModal');
  const noteForm = $('noteForm');
  const modalTitle = $('modalTitle');
  const modalIssueNo = $('modalIssueNo');
  const authorInput = $('authorInput');
  const statusInput = $('statusInput');
  const noteInput = $('noteInput');
  const imageInput = $('imageInput');
  const existingImages = $('existingImages');
  const formError = $('formError');
  const saveNoteBtn = $('saveNoteBtn');
  const cancelNoteBtn = $('cancelNoteBtn');
  const cancelNoteX = $('cancelNoteX');

  const imageViewer = $('imageViewer');
  const imageViewerImg = $('imageViewerImg');
  const closeImageViewer = $('closeImageViewer');

  const isMobile = window.matchMedia('(max-width: 720px)').matches;

  const viewer = new Cesium.Viewer('cesiumContainer', {
    animation: false,
    timeline: false,
    baseLayerPicker: false,
    geocoder: false,
    homeButton: false,
    sceneModePicker: false,
    navigationHelpButton: false,
    infoBox: false,
    selectionIndicator: false,
    fullscreenButton: false,
    vrButton: false,
    baseLayer: false,
    globe: false,
    shadows: false,
    shouldAnimate: false
  });

  viewer.scene.backgroundColor = Cesium.Color.fromCssColorString('#101216');
  viewer.scene.skyBox.show = false;
  viewer.scene.skyAtmosphere.show = false;
  viewer.scene.sun.show = false;
  viewer.scene.moon.show = false;
  viewer.scene.fog.enabled = false;
  viewer.scene.pickTranslucentDepth = true;
  viewer.scene.postProcessStages.fxaa.enabled = true;

  const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false
    }
  });

  let tileset = null;
  let mode = 'none'; // none | measure | area | note | building
  let pendingMeasurePoint = null;
  let areaPoints = [];
  let buildingPoints = [];
  let buildingSettings = null;
  let buildingClipping = null;
  let pendingNoteAnchor = null;
  let editingAnnotation = null;
  let currentUser = null;
  let annotations = [];
  let notesVisible = true;
  let realtimeChannel = null;
  let toastTimer = null;

  const measurementEntities = [];
  const annotationEntities = new Map();

  const statusNames = {
    open: 'Отворена',
    review: 'За проверка',
    done: 'Изпълнена'
  };

  const statusCss = {
    open: 'status-open',
    review: 'status-review',
    done: 'status-done'
  };

  const statusCesium = {
    open: Cesium.Color.fromCssColorString('#ffd54a'),
    review: Cesium.Color.fromCssColorString('#6db6ff'),
    done: Cesium.Color.fromCssColorString('#75d889')
  };

  function setLoadState(text, type = '') {
    loadState.textContent = text;
    loadState.className = `load-state glass ${type}`.trim();
  }

  function setSyncState(text, type = '') {
    syncState.textContent = text;
    syncState.className = `load-state glass sync-state ${type}`.trim();
  }

  function showToast(message, type = '') {
    clearTimeout(toastTimer);
    toast.textContent = message;
    toast.className = `toast glass ${type}`.trim();
    toast.hidden = false;
    toastTimer = setTimeout(() => {
      toast.hidden = true;
    }, 3200);
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function formatDistance(meters) {
    if (!Number.isFinite(meters)) return '—';
    if (meters < 1) return `${(meters * 100).toFixed(1)} cm`;
    if (meters < 10) return `${meters.toFixed(3)} m`;
    if (meters < 1000) return `${meters.toFixed(2)} m`;
    return `${(meters / 1000).toFixed(3)} km`;
  }

  function formatDate(value) {
    if (!value) return '';
    try {
      return new Intl.DateTimeFormat('bg-BG', {
        dateStyle: 'short',
        timeStyle: 'short'
      }).format(new Date(value));
    } catch (_) {
      return String(value);
    }
  }

  function annotationNumber(row) {
    return `#${String(row.annotation_no || 0).padStart(3, '0')}`;
  }

  function wrapText(text, maxChars = 34, maxLines = 4) {
    const normalized = String(text || '').replace(/\s+/g, ' ').trim();
    if (!normalized) return '';
    const words = normalized.split(' ');
    const lines = [];
    let line = '';

    for (const word of words) {
      const next = line ? `${line} ${word}` : word;
      if (next.length > maxChars && line) {
        lines.push(line);
        line = word;
        if (lines.length >= maxLines) break;
      } else {
        line = next;
      }
    }

    if (lines.length < maxLines && line) lines.push(line);
    let result = lines.join('\n');
    if (result.replaceAll('\n', ' ').length < normalized.length) result += '…';
    return result;
  }

  function getPublicImageUrl(path) {
    if (!path) return '';
    const { data } = db.storage.from(STORAGE_BUCKET).getPublicUrl(path);
    return data?.publicUrl || '';
  }

  function setMode(next) {
    mode = next;
    pendingMeasurePoint = null;
    pendingNoteAnchor = null;
    if (mode !== 'area') areaPoints = [];
    if (mode !== 'building') buildingPoints = [];

    measureBtn.classList.toggle('active', mode === 'measure');
    areaBtn.classList.toggle('active', mode === 'area');
    noteBtn.classList.toggle('active', mode === 'note');
    buildingBtn.classList.toggle('active', mode === 'building');
    container.classList.toggle('mode-pick', mode !== 'none');

    if (mode !== 'area') areaBtn.querySelector('span:last-child').textContent = 'Площ';

    if (mode === 'measure') {
      interactionHint.hidden = false;
      interactionHint.textContent = 'Избери първа точка за измерване';
    } else if (mode === 'area') {
      interactionHint.hidden = false;
      interactionHint.textContent = 'Посочи минимум 3 точки по контура. После натисни „Завърши“.';
    } else if (mode === 'note') {
      interactionHint.hidden = false;
      interactionHint.textContent = 'Щракни върху мястото за новата забележка';
    } else if (mode === 'building') {
      interactionHint.hidden = false;
      interactionHint.textContent = '1/4: посочи ПРЕДЕН ЛЯВ ъгъл на сградата';
      setBuildingCrop(false);
    } else {
      interactionHint.hidden = true;
    }
  }

  function addMeasurementPoint(position) {
    const entity = viewer.entities.add({
      position,
      point: {
        pixelSize: 10,
        color: Cesium.Color.fromCssColorString('#ffd54a'),
        outlineColor: Cesium.Color.fromCssColorString('#111318'),
        outlineWidth: 2
      }
    });
    measurementEntities.push(entity);
  }

  function addMeasurementLine(a, b, distance) {
    const midpoint = Cesium.Cartesian3.midpoint(a, b, new Cesium.Cartesian3());
    const line = viewer.entities.add({
      polyline: {
        positions: [a, b],
        width: 4,
        material: Cesium.Color.fromCssColorString('#ffd54a'),
        depthFailMaterial: Cesium.Color.fromCssColorString('#ffd54a').withAlpha(0.45)
      }
    });

    const label = viewer.entities.add({
      position: midpoint,
      label: {
        text: formatDistance(distance),
        font: '600 15px Inter, Arial, sans-serif',
        fillColor: Cesium.Color.WHITE,
        showBackground: true,
        backgroundColor: Cesium.Color.fromCssColorString('#111318').withAlpha(0.88),
        backgroundPadding: new Cesium.Cartesian2(8, 5),
        pixelOffset: new Cesium.Cartesian2(0, -18),
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        disableDepthTestDistance: Number.POSITIVE_INFINITY
      }
    });

    measurementEntities.push(line, label);
  }

  function clearMeasurements() {
    measurementEntities.splice(0).forEach((entity) => viewer.entities.remove(entity));
    pendingMeasurePoint = null;
    if (mode === 'measure') interactionHint.textContent = 'Избери първа точка за измерване';
  }


  function addAreaPoint(position) {
    areaPoints.push(Cesium.Cartesian3.clone(position));
    const point = viewer.entities.add({
      position,
      point: {
        pixelSize: 9,
        color: Cesium.Color.fromCssColorString('#73d8ff'),
        outlineColor: Cesium.Color.fromCssColorString('#101216'),
        outlineWidth: 2,
        disableDepthTestDistance: Number.POSITIVE_INFINITY
      }
    });
    measurementEntities.push(point);

    if (areaPoints.length > 1) {
      const line = viewer.entities.add({
        polyline: {
          positions: [areaPoints[areaPoints.length - 2], areaPoints[areaPoints.length - 1]],
          width: 3,
          material: Cesium.Color.fromCssColorString('#73d8ff'),
          depthFailMaterial: Cesium.Color.fromCssColorString('#73d8ff').withAlpha(0.45)
        }
      });
      measurementEntities.push(line);
    }

    if (areaPoints.length >= 3) areaBtn.querySelector('span:last-child').textContent = 'Завърши';
    interactionHint.textContent = `${areaPoints.length} точки · ${areaPoints.length >= 3 ? 'натисни „Завърши“ или добави още' : 'добави още точки'}`;
  }

  function triangleArea3D(a, b, c) {
    const ab = Cesium.Cartesian3.subtract(b, a, new Cesium.Cartesian3());
    const ac = Cesium.Cartesian3.subtract(c, a, new Cesium.Cartesian3());
    const cross = Cesium.Cartesian3.cross(ab, ac, new Cesium.Cartesian3());
    return 0.5 * Cesium.Cartesian3.magnitude(cross);
  }

  function formatArea(squareMeters) {
    if (!Number.isFinite(squareMeters)) return '—';
    if (squareMeters < 1) return `${(squareMeters * 10000).toFixed(0)} cm²`;
    if (squareMeters < 10000) return `${squareMeters.toFixed(2)} m²`;
    return `${(squareMeters / 10000).toFixed(4)} ha`;
  }

  function finishAreaMeasurement() {
    if (areaPoints.length < 3) {
      showToast('За площ са нужни минимум 3 точки.', 'error');
      return;
    }

    let area = 0;
    for (let i = 1; i < areaPoints.length - 1; i++) {
      area += triangleArea3D(areaPoints[0], areaPoints[i], areaPoints[i + 1]);
    }

    const closingLine = viewer.entities.add({
      polyline: {
        positions: [areaPoints[areaPoints.length - 1], areaPoints[0]],
        width: 3,
        material: Cesium.Color.fromCssColorString('#73d8ff'),
        depthFailMaterial: Cesium.Color.fromCssColorString('#73d8ff').withAlpha(0.45)
      }
    });

    const polygon = viewer.entities.add({
      polygon: {
        hierarchy: new Cesium.PolygonHierarchy(areaPoints.map((p) => Cesium.Cartesian3.clone(p))),
        perPositionHeight: true,
        material: Cesium.Color.fromCssColorString('#73d8ff').withAlpha(0.18),
        outline: true,
        outlineColor: Cesium.Color.fromCssColorString('#73d8ff')
      }
    });

    const centroid = areaPoints.reduce(
      (acc, p) => Cesium.Cartesian3.add(acc, p, acc),
      new Cesium.Cartesian3()
    );
    Cesium.Cartesian3.divideByScalar(centroid, areaPoints.length, centroid);

    const label = viewer.entities.add({
      position: centroid,
      label: {
        text: formatArea(area),
        font: '700 16px Inter, Arial, sans-serif',
        fillColor: Cesium.Color.WHITE,
        showBackground: true,
        backgroundColor: Cesium.Color.fromCssColorString('#111318').withAlpha(0.92),
        backgroundPadding: new Cesium.Cartesian2(9, 6),
        pixelOffset: new Cesium.Cartesian2(0, -16),
        disableDepthTestDistance: Number.POSITIVE_INFINITY
      }
    });

    measurementEntities.push(closingLine, polygon, label);
    showToast(`Площ: ${formatArea(area)}`, 'ok');
    areaPoints = [];
    areaBtn.querySelector('span:last-child').textContent = 'Площ';
    interactionHint.textContent = 'Избери първа точка за нова площ';
  }

  function addBuildingSelectionPoint(position) {
    buildingPoints.push(Cesium.Cartesian3.clone(position));
    const point = viewer.entities.add({
      position,
      point: {
        pixelSize: 11,
        color: Cesium.Color.fromCssColorString('#ff9f55'),
        outlineColor: Cesium.Color.fromCssColorString('#101216'),
        outlineWidth: 2,
        disableDepthTestDistance: Number.POSITIVE_INFINITY
      }
    });
    measurementEntities.push(point);

    if (buildingPoints.length > 1) {
      const line = viewer.entities.add({
        polyline: {
          positions: [buildingPoints[buildingPoints.length - 2], buildingPoints[buildingPoints.length - 1]],
          width: 3,
          material: Cesium.Color.fromCssColorString('#ff9f55')
        }
      });
      measurementEntities.push(line);
    }

    const prompts = [
      '2/4: посочи ПРЕДЕН ДЕСЕН ъгъл',
      '3/4: посочи ЗАДЕН ДЕСЕН ъгъл',
      '4/4: посочи ЗАДЕН ЛЯВ ъгъл'
    ];
    if (buildingPoints.length < 4) {
      interactionHint.textContent = prompts[buildingPoints.length - 1];
    } else {
      finishBuildingSelection();
    }
  }

  function averageCartesian(points) {
    const result = new Cesium.Cartesian3();
    points.forEach((p) => Cesium.Cartesian3.add(result, p, result));
    return Cesium.Cartesian3.divideByScalar(result, points.length, result);
  }

  async function finishBuildingSelection() {
    if (buildingPoints.length !== 4 || !currentUser) return;

    const center = averageCartesian(buildingPoints);
    const frontMid = Cesium.Cartesian3.midpoint(buildingPoints[0], buildingPoints[1], new Cesium.Cartesian3());
    const backMid = Cesium.Cartesian3.midpoint(buildingPoints[3], buildingPoints[2], new Cesium.Cartesian3());

    const right = Cesium.Cartesian3.normalize(
      Cesium.Cartesian3.subtract(buildingPoints[1], buildingPoints[0], new Cesium.Cartesian3()),
      new Cesium.Cartesian3()
    );
    const back = Cesium.Cartesian3.normalize(
      Cesium.Cartesian3.subtract(backMid, frontMid, new Cesium.Cartesian3()),
      new Cesium.Cartesian3()
    );
    const front = Cesium.Cartesian3.negate(back, new Cesium.Cartesian3());
    const up = Cesium.Cartesian3.normalize(center, new Cesium.Cartesian3());

    const frontWidth = Cesium.Cartesian3.distance(buildingPoints[0], buildingPoints[1]);
    const backWidth = Cesium.Cartesian3.distance(buildingPoints[3], buildingPoints[2]);
    const leftDepth = Cesium.Cartesian3.distance(buildingPoints[0], buildingPoints[3]);
    const rightDepth = Cesium.Cartesian3.distance(buildingPoints[1], buildingPoints[2]);
    const halfWidth = Math.max(frontWidth, backWidth) / 2 + 1.5;
    const halfDepth = Math.max(leftDepth, rightDepth) / 2 + 1.5;
    const range = Math.max(halfWidth * 2, halfDepth * 2, 12);

    const payload = {
      model_id: MODEL_ID,
      center_x: center.x, center_y: center.y, center_z: center.z,
      front_x: front.x, front_y: front.y, front_z: front.z,
      up_x: up.x, up_y: up.y, up_z: up.z,
      right_x: right.x, right_y: right.y, right_z: right.z,
      half_width_m: halfWidth,
      half_depth_m: halfDepth,
      range_m: range,
      height_offset_m: 0,
      updated_by: currentUser.id
    };

    let query = db.from('model_view_settings').upsert(payload, { onConflict: 'model_id' }).select('*').single();
    const { data, error } = await query;
    if (error) {
      console.error(error);
      showToast('Не успях да запиша настройката на сградата. Ако е настройвана от друг браузър, изтрий реда model_view_settings и опитай пак.', 'error');
      setMode('none');
      return;
    }

    buildingSettings = data;
    cropBuildingToggle.checked = true;
    setBuildingCrop(true);
    showToast('Сградата е настроена. Готовите изгледи са активни.', 'ok');
    setMode('none');
    viewsPanel.hidden = false;
  }

  async function loadBuildingSettings() {
    const { data, error } = await db
      .from('model_view_settings')
      .select('*')
      .eq('model_id', MODEL_ID)
      .maybeSingle();
    if (error) {
      console.warn('Building settings load failed', error);
      return;
    }
    buildingSettings = data || null;
    if (buildingSettings && cropBuildingToggle.checked) setBuildingCrop(true);
  }

  function getBuildingVectors() {
    if (!buildingSettings) return null;
    return {
      center: new Cesium.Cartesian3(buildingSettings.center_x, buildingSettings.center_y, buildingSettings.center_z),
      front: Cesium.Cartesian3.normalize(new Cesium.Cartesian3(buildingSettings.front_x, buildingSettings.front_y, buildingSettings.front_z), new Cesium.Cartesian3()),
      right: Cesium.Cartesian3.normalize(new Cesium.Cartesian3(buildingSettings.right_x, buildingSettings.right_y, buildingSettings.right_z), new Cesium.Cartesian3()),
      up: Cesium.Cartesian3.normalize(new Cesium.Cartesian3(buildingSettings.up_x, buildingSettings.up_y, buildingSettings.up_z), new Cesium.Cartesian3())
    };
  }

  function setBuildingCrop(enabled) {
    if (!tileset) return;
    if (buildingClipping) {
      try { buildingClipping.destroy(); } catch (_) {}
      buildingClipping = null;
      tileset.clippingPlanes = undefined;
    }
    if (!enabled || !buildingSettings) return;

    const v = getBuildingVectors();
    const back = Cesium.Cartesian3.negate(v.front, new Cesium.Cartesian3());
    const rotation = Cesium.Matrix3.fromColumns(v.right, back, v.up, new Cesium.Matrix3());
    const modelMatrix = Cesium.Matrix4.fromRotationTranslation(rotation, v.center, new Cesium.Matrix4());
    const hw = Math.max(Number(buildingSettings.half_width_m) || 10, 1);
    const hd = Math.max(Number(buildingSettings.half_depth_m) || 10, 1);

    buildingClipping = new Cesium.ClippingPlaneCollection({
      modelMatrix,
      planes: [
        new Cesium.ClippingPlane(new Cesium.Cartesian3(1, 0, 0), hw),
        new Cesium.ClippingPlane(new Cesium.Cartesian3(-1, 0, 0), hw),
        new Cesium.ClippingPlane(new Cesium.Cartesian3(0, 1, 0), hd),
        new Cesium.ClippingPlane(new Cesium.Cartesian3(0, -1, 0), hd)
      ],
      unionClippingRegions: false,
      edgeWidth: 0.5,
      edgeColor: Cesium.Color.fromCssColorString('#ff9f55')
    });
    tileset.clippingPlanes = buildingClipping;
  }

  async function flyToBuildingView(viewName) {
    if (!buildingSettings) {
      showToast('Първо натисни „Сграда“ и посочи 4-те ѝ ъгъла.', 'error');
      return;
    }
    const v = getBuildingVectors();
    const distance = Math.max(Number(buildingSettings.range_m) * 1.7, 18);
    let cameraDir;
    let cameraUp = v.up;

    if (viewName === 'front') cameraDir = v.front;
    if (viewName === 'back') cameraDir = Cesium.Cartesian3.negate(v.front, new Cesium.Cartesian3());
    if (viewName === 'right') cameraDir = v.right;
    if (viewName === 'left') cameraDir = Cesium.Cartesian3.negate(v.right, new Cesium.Cartesian3());
    if (viewName === 'top') {
      cameraDir = v.up;
      cameraUp = v.front;
    }
    if (!cameraDir) return;

    const destination = Cesium.Cartesian3.add(
      v.center,
      Cesium.Cartesian3.multiplyByScalar(cameraDir, viewName === 'top' ? distance * 1.05 : distance, new Cesium.Cartesian3()),
      new Cesium.Cartesian3()
    );
    const direction = Cesium.Cartesian3.normalize(
      Cesium.Cartesian3.subtract(v.center, destination, new Cesium.Cartesian3()),
      new Cesium.Cartesian3()
    );

    setBuildingCrop(cropBuildingToggle.checked);
    await viewer.camera.flyTo({
      destination,
      orientation: { direction, up: cameraUp },
      duration: 0.8
    });
  }

  function computeLabelPosition(anchor) {
    const matrix = Cesium.Transforms.eastNorthUpToFixedFrame(anchor);
    const offset = isMobile
      ? new Cesium.Cartesian3(2.0, 1.0, 2.0)
      : new Cesium.Cartesian3(3.5, 1.6, 2.8);
    return Cesium.Matrix4.multiplyByPoint(matrix, offset, new Cesium.Cartesian3());
  }

  function removeAnnotationEntities() {
    for (const group of annotationEntities.values()) {
      group.forEach((entity) => viewer.entities.remove(entity));
    }
    annotationEntities.clear();
  }

  function labelPositionFor(row) {
    if ([row.label_x, row.label_y, row.label_z].every(Number.isFinite)) {
      return new Cesium.Cartesian3(row.label_x, row.label_y, row.label_z);
    }
    return computeLabelPosition(new Cesium.Cartesian3(row.x, row.y, row.z));
  }

  function renderAnnotationEntities() {
    removeAnnotationEntities();

    for (const row of annotations) {
      const anchor = new Cesium.Cartesian3(row.x, row.y, row.z);
      const labelPosition = labelPositionFor(row);
      const color = statusCesium[row.status] || statusCesium.open;
      const labelText = `${annotationNumber(row)} · ${row.author_name}\n${wrapText(row.note)}`;

      const point = viewer.entities.add({
        position: anchor,
        show: notesVisible,
        point: {
          pixelSize: 12,
          color,
          outlineColor: Cesium.Color.fromCssColorString('#101216'),
          outlineWidth: 2,
          disableDepthTestDistance: Number.POSITIVE_INFINITY
        },
        properties: { annotationId: row.id }
      });

      const line = viewer.entities.add({
        show: notesVisible,
        polyline: {
          positions: [anchor, labelPosition],
          width: 2.5,
          material: color,
          depthFailMaterial: color.withAlpha(0.45)
        },
        properties: { annotationId: row.id }
      });

      const label = viewer.entities.add({
        position: labelPosition,
        show: notesVisible,
        label: {
          text: labelText,
          font: '600 13px Inter, Arial, sans-serif',
          fillColor: Cesium.Color.WHITE,
          showBackground: true,
          backgroundColor: Cesium.Color.fromCssColorString('#111318').withAlpha(0.92),
          backgroundPadding: new Cesium.Cartesian2(9, 7),
          horizontalOrigin: Cesium.HorizontalOrigin.LEFT,
          verticalOrigin: Cesium.VerticalOrigin.CENTER,
          pixelOffset: new Cesium.Cartesian2(5, 0),
          disableDepthTestDistance: Number.POSITIVE_INFINITY
        },
        properties: { annotationId: row.id }
      });

      annotationEntities.set(row.id, [point, line, label]);
    }
  }

  function updateAuthorFilter() {
    const current = authorFilter.value;
    const authors = [...new Set(annotations.map((row) => row.author_name).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, 'bg'));

    authorFilter.innerHTML = '<option value="all">Всички</option>' +
      authors.map((author) => `<option value="${escapeHtml(author)}">${escapeHtml(author)}</option>`).join('');

    authorFilter.value = authors.includes(current) ? current : 'all';
  }

  function filteredAnnotations() {
    const status = statusFilter.value;
    const author = authorFilter.value;
    const search = searchInput.value.trim().toLocaleLowerCase('bg');

    return annotations.filter((row) => {
      if (status !== 'all' && row.status !== status) return false;
      if (author !== 'all' && row.author_name !== author) return false;
      if (search) {
        const haystack = `${row.author_name} ${row.note} ${annotationNumber(row)}`.toLocaleLowerCase('bg');
        if (!haystack.includes(search)) return false;
      }
      return true;
    });
  }

  function renderImagesForCard(row) {
    const paths = Array.isArray(row.image_paths) ? row.image_paths : [];
    if (!paths.length) return '';

    const items = paths.slice(0, 4).map((path) => {
      const url = getPublicImageUrl(path);
      return `<img class="card-image" data-image-url="${escapeHtml(url)}" src="${escapeHtml(url)}" alt="Снимка към ${escapeHtml(annotationNumber(row))}" />`;
    }).join('');

    const more = paths.length > 4 ? `<div class="image-more">+${paths.length - 4}</div>` : '';
    return `<div class="card-images">${items}${more}</div>`;
  }

  function renderNotesList() {
    updateAuthorFilter();
    const rows = filteredAnnotations();
    noteCount.textContent = `${rows.length} от ${annotations.length} забележки`;

    if (!rows.length) {
      notesList.innerHTML = '<div class="empty-state">Няма забележки по избраните филтри.</div>';
      return;
    }

    notesList.innerHTML = rows.map((row) => {
      const own = currentUser && row.created_by === currentUser.id;
      const actions = own
        ? `<div class="note-card-actions">
             <button class="mini-btn" type="button" data-action="edit" data-id="${row.id}">Редактирай</button>
             <button class="mini-btn danger-btn" type="button" data-action="delete" data-id="${row.id}">Изтрий</button>
           </div>`
        : '';

      return `
        <article class="note-card" data-id="${row.id}">
          <div class="note-card-head">
            <div>
              <div class="note-card-title">${annotationNumber(row)} · ${escapeHtml(row.author_name)}</div>
              <div class="note-card-meta">${escapeHtml(formatDate(row.created_at))}</div>
            </div>
            <span class="status-badge ${statusCss[row.status] || ''}">${escapeHtml(statusNames[row.status] || row.status)}</span>
          </div>
          <div class="note-card-text">${escapeHtml(row.note)}</div>
          ${renderImagesForCard(row)}
          ${actions}
        </article>`;
    }).join('');
  }

  function openPanel() {
    notesPanel.hidden = false;
    panelBtn.classList.add('active');
  }

  function closePanel() {
    notesPanel.hidden = true;
    panelBtn.classList.remove('active');
  }

  async function loadAnnotations() {
    if (!currentUser) return;
    setSyncState('Забележки: зареждане…');

    const { data, error } = await db
      .from('annotations')
      .select('*')
      .eq('model_id', MODEL_ID)
      .order('annotation_no', { ascending: true });

    if (error) {
      console.error(error);
      setSyncState('Забележки: грешка', 'error');
      return;
    }

    annotations = data || [];
    renderAnnotationEntities();
    renderNotesList();
    setSyncState(`Забележки: ${annotations.length}`, 'ok');
  }

  async function ensureAnonymousSession() {
    const { data: sessionData } = await db.auth.getSession();
    if (sessionData?.session?.user) {
      currentUser = sessionData.session.user;
      return;
    }

    const { data, error } = await db.auth.signInAnonymously();
    if (error) throw error;
    currentUser = data.user;
  }

  function openNewNoteModal(anchor) {
    editingAnnotation = null;
    pendingNoteAnchor = Cesium.Cartesian3.clone(anchor);
    modalTitle.textContent = 'Нова забележка';
    modalIssueNo.textContent = 'Ще се създаде нов номер автоматично';
    authorInput.value = localStorage.getItem('annotationAuthor') || '';
    statusInput.value = 'open';
    noteInput.value = '';
    imageInput.value = '';
    existingImages.innerHTML = '';
    formError.hidden = true;
    noteModal.hidden = false;
    setTimeout(() => authorInput.focus(), 30);
  }

  function renderExistingImages(row) {
    const paths = Array.isArray(row.image_paths) ? row.image_paths : [];
    if (!paths.length) {
      existingImages.innerHTML = '';
      return;
    }

    existingImages.innerHTML = `
      <div class="existing-images-title">Съществуващи снимки</div>
      ${paths.map((path, index) => {
        const url = getPublicImageUrl(path);
        return `
          <div class="existing-image-row">
            <img src="${escapeHtml(url)}" alt="Снимка ${index + 1}" />
            <label><input type="checkbox" class="remove-existing-image" data-path="${escapeHtml(path)}" /> Премахни</label>
          </div>`;
      }).join('')}`;
  }

  function openEditNoteModal(row) {
    if (!currentUser || row.created_by !== currentUser.id) {
      showToast('Можеш да редактираш само забележките, създадени от този браузър.', 'error');
      return;
    }

    editingAnnotation = row;
    pendingNoteAnchor = new Cesium.Cartesian3(row.x, row.y, row.z);
    modalTitle.textContent = 'Редакция на забележка';
    modalIssueNo.textContent = annotationNumber(row);
    authorInput.value = row.author_name || '';
    statusInput.value = row.status || 'open';
    noteInput.value = row.note || '';
    imageInput.value = '';
    formError.hidden = true;
    renderExistingImages(row);
    noteModal.hidden = false;
  }

  function closeNoteModal() {
    noteModal.hidden = true;
    editingAnnotation = null;
    pendingNoteAnchor = null;
    imageInput.value = '';
    existingImages.innerHTML = '';
    formError.hidden = true;
  }

  function showFormError(message) {
    formError.textContent = message;
    formError.hidden = false;
  }

  function validateFiles(files) {
    const allowed = new Set(['image/jpeg', 'image/png', 'image/webp']);
    if (files.length > 8) return 'Можеш да добавиш максимум 8 снимки наведнъж.';
    for (const file of files) {
      if (!allowed.has(file.type)) return 'Позволени са JPG, PNG и WEBP изображения.';
      if (file.size > 10 * 1024 * 1024) return `Снимката „${file.name}“ е над 10 MB.`;
    }
    return '';
  }

  function safeFileName(name) {
    return String(name || 'image')
      .normalize('NFKD')
      .replace(/[^a-zA-Z0-9._-]+/g, '_')
      .replace(/_+/g, '_')
      .slice(-100);
  }

  async function uploadImages(annotationId, files) {
    const uploadedPaths = [];
    for (const file of files) {
      const path = `${currentUser.id}/${MODEL_ID}/${annotationId}/${Date.now()}-${crypto.randomUUID()}-${safeFileName(file.name)}`;
      const { error } = await db.storage.from(STORAGE_BUCKET).upload(path, file, {
        cacheControl: '3600',
        upsert: false,
        contentType: file.type
      });
      if (error) throw error;
      uploadedPaths.push(path);
    }
    return uploadedPaths;
  }

  async function removeStoredImages(paths) {
    if (!paths?.length) return;
    const { error } = await db.storage.from(STORAGE_BUCKET).remove(paths);
    if (error) console.warn('Storage remove warning:', error);
  }

  async function saveAnnotation(event) {
    event.preventDefault();
    formError.hidden = true;

    if (!currentUser) return showFormError('Няма активна сесия. Презареди страницата.');

    const authorName = authorInput.value.trim();
    const note = noteInput.value.trim();
    const status = statusInput.value;
    const files = [...imageInput.files];
    const fileError = validateFiles(files);

    if (!authorName || !note) return showFormError('Попълни автор и текст на забележката.');
    if (fileError) return showFormError(fileError);

    localStorage.setItem('annotationAuthor', authorName);
    saveNoteBtn.disabled = true;
    saveNoteBtn.textContent = 'Записване…';

    try {
      if (editingAnnotation) {
        const row = editingAnnotation;
        const removePaths = [...document.querySelectorAll('.remove-existing-image:checked')]
          .map((el) => el.dataset.path)
          .filter(Boolean);

        const oldPaths = Array.isArray(row.image_paths) ? row.image_paths : [];
        let keepPaths = oldPaths.filter((path) => !removePaths.includes(path));

        const newPaths = files.length ? await uploadImages(row.id, files) : [];
        keepPaths = [...keepPaths, ...newPaths];

        const { error } = await db
          .from('annotations')
          .update({
            author_name: authorName,
            note,
            status,
            image_paths: keepPaths
          })
          .eq('id', row.id);

        if (error) throw error;
        await removeStoredImages(removePaths);
        showToast(`${annotationNumber(row)} е обновена.`, 'ok');
      } else {
        if (!pendingNoteAnchor) throw new Error('Липсва избрана 3D точка.');
        const labelPosition = computeLabelPosition(pendingNoteAnchor);

        const payload = {
          model_id: MODEL_ID,
          author_name: authorName,
          note,
          status,
          x: pendingNoteAnchor.x,
          y: pendingNoteAnchor.y,
          z: pendingNoteAnchor.z,
          label_x: labelPosition.x,
          label_y: labelPosition.y,
          label_z: labelPosition.z,
          image_paths: [],
          created_by: currentUser.id
        };

        const { data, error } = await db
          .from('annotations')
          .insert(payload)
          .select('*')
          .single();

        if (error) throw error;

        if (files.length) {
          const uploadedPaths = await uploadImages(data.id, files);
          const { error: imageError } = await db
            .from('annotations')
            .update({ image_paths: uploadedPaths })
            .eq('id', data.id);
          if (imageError) throw imageError;
        }

        showToast(`${annotationNumber(data)} е създадена.`, 'ok');
      }

      closeNoteModal();
      setMode('none');
      await loadAnnotations();
    } catch (error) {
      console.error(error);
      showFormError(error?.message || 'Грешка при записване на забележката.');
    } finally {
      saveNoteBtn.disabled = false;
      saveNoteBtn.textContent = 'Запази';
    }
  }

  async function deleteAnnotation(row) {
    if (!currentUser || row.created_by !== currentUser.id) {
      showToast('Можеш да изтриеш само забележките, създадени от този браузър.', 'error');
      return;
    }

    if (!confirm(`Да изтрия ли ${annotationNumber(row)}?`)) return;

    try {
      const paths = Array.isArray(row.image_paths) ? row.image_paths : [];
      const { error } = await db.from('annotations').delete().eq('id', row.id);
      if (error) throw error;
      await removeStoredImages(paths);
      showToast(`${annotationNumber(row)} е изтрита.`, 'ok');
      await loadAnnotations();
    } catch (error) {
      console.error(error);
      showToast('Грешка при изтриване.', 'error');
    }
  }

  async function focusAnnotation(row) {
    const anchor = new Cesium.Cartesian3(row.x, row.y, row.z);
    const labelPosition = labelPositionFor(row);
    const center = Cesium.Cartesian3.midpoint(anchor, labelPosition, new Cesium.Cartesian3());

    const distance = Math.max(Cesium.Cartesian3.distance(anchor, labelPosition) * 6, 18);
    const direction = Cesium.Cartesian3.normalize(center, new Cesium.Cartesian3());
    const destination = Cesium.Cartesian3.add(
      center,
      Cesium.Cartesian3.multiplyByScalar(direction, distance, new Cesium.Cartesian3()),
      new Cesium.Cartesian3()
    );

    await viewer.camera.flyTo({
      destination,
      orientation: {
        direction: Cesium.Cartesian3.normalize(
          Cesium.Cartesian3.subtract(center, destination, new Cesium.Cartesian3()),
          new Cesium.Cartesian3()
        ),
        up: Cesium.Cartesian3.UNIT_Z
      },
      duration: 0.8
    });
  }

  function toggleNotesLayer() {
    notesVisible = !notesVisible;
    notesLayerBtn.classList.toggle('active', notesVisible);
    notesLayerBtn.querySelector('.tool-icon').textContent = notesVisible ? '◉' : '○';
    for (const group of annotationEntities.values()) {
      group.forEach((entity) => { entity.show = notesVisible; });
    }
  }

  function exportExcel() {
    const rows = filteredAnnotations();
    if (!rows.length) return showToast('Няма забележки за export.', 'error');
    if (!window.XLSX) return showToast('Excel библиотеката не е заредена.', 'error');

    const data = rows.map((row) => ({
      '№': annotationNumber(row),
      'Автор': row.author_name,
      'Статус': statusNames[row.status] || row.status,
      'Забележка': row.note,
      'Дата': formatDate(row.created_at),
      'X': row.x,
      'Y': row.y,
      'Z': row.z,
      'Снимки': (row.image_paths || []).map(getPublicImageUrl).join('\n')
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    ws['!cols'] = [
      { wch: 8 }, { wch: 24 }, { wch: 16 }, { wch: 65 }, { wch: 20 },
      { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 45 }
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Забележки');
    XLSX.writeFile(wb, `${MODEL_ID}-zabelezhki.xlsx`);
  }

  function exportPdf() {
    const rows = filteredAnnotations();
    if (!rows.length) return showToast('Няма забележки за export.', 'error');
    if (!window.pdfMake) return showToast('PDF библиотеката не е заредена.', 'error');

    const body = [
      [
        { text: '№', bold: true },
        { text: 'Автор', bold: true },
        { text: 'Статус', bold: true },
        { text: 'Забележка', bold: true },
        { text: 'Дата', bold: true }
      ],
      ...rows.map((row) => [
        annotationNumber(row),
        row.author_name,
        statusNames[row.status] || row.status,
        row.note,
        formatDate(row.created_at)
      ])
    ];

    const docDefinition = {
      pageSize: 'A4',
      pageOrientation: 'landscape',
      pageMargins: [28, 34, 28, 34],
      content: [
        { text: `${MODEL_TITLE} — Забележки`, fontSize: 18, bold: true, margin: [0, 0, 0, 12] },
        { text: `Генерирано: ${formatDate(new Date())}`, fontSize: 9, color: '#555', margin: [0, 0, 0, 12] },
        {
          table: {
            headerRows: 1,
            widths: [34, 110, 80, '*', 95],
            body
          },
          layout: 'lightHorizontalLines',
          fontSize: 9
        }
      ],
      defaultStyle: { font: 'Roboto', fontSize: 9 }
    };

    pdfMake.createPdf(docDefinition).download(`${MODEL_ID}-zabelezhki.pdf`);
  }

  function openImage(url) {
    if (!url) return;
    imageViewerImg.src = url;
    imageViewer.hidden = false;
  }

  async function loadTileset() {
    try {
      setLoadState('Модел: зареждане…');
      tileset = await Cesium.Cesium3DTileset.fromUrl('./tileset.json', {
        maximumScreenSpaceError: isMobile ? 6 : 2,
        skipLevelOfDetail: false,
        preferLeaves: true,
        dynamicScreenSpaceError: false,
        preloadWhenHidden: false
      });

      viewer.scene.primitives.add(tileset);
      await viewer.zoomTo(tileset);
      setLoadState('Моделът е готов', 'ok');
      viewer.camera.lookUp(Cesium.Math.toRadians(6));
    } catch (error) {
      console.error(error);
      setLoadState('Модел: грешка', 'error');
      showToast('Моделът не можа да се зареди.', 'error');
    }
  }

  function setupRealtime() {
    if (realtimeChannel) db.removeChannel(realtimeChannel);

    realtimeChannel = db
      .channel(`annotations-${MODEL_ID}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'annotations',
          filter: `model_id=eq.${MODEL_ID}`
        },
        () => loadAnnotations()
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') setSyncState(`Забележки: ${annotations.length}`, 'ok');
        if (status === 'CHANNEL_ERROR') setSyncState('Забележки: realtime грешка', 'error');
      });
  }

  const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);

  handler.setInputAction((movement) => {
    const picked = viewer.scene.pick(movement.position);

    if (mode === 'none' && Cesium.defined(picked?.id)) {
      const annotationId = picked.id?.properties?.annotationId?.getValue?.();
      if (annotationId) {
        const row = annotations.find((item) => item.id === annotationId);
        if (row) {
          openPanel();
          renderNotesList();
          setTimeout(() => {
            const card = notesList.querySelector(`[data-id="${CSS.escape(row.id)}"]`);
            card?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            card?.classList.add('note-card-highlight');
            setTimeout(() => card?.classList.remove('note-card-highlight'), 1300);
          }, 50);
        }
        return;
      }
    }

    if (mode === 'none') return;

    let position;
    try {
      position = viewer.scene.pickPosition(movement.position);
    } catch (error) {
      console.warn('pickPosition failed', error);
      return;
    }

    if (!Cesium.defined(position)) {
      interactionHint.textContent = 'Щракни директно върху повърхност от модела';
      return;
    }

    if (mode === 'measure') {
      addMeasurementPoint(position);
      if (!pendingMeasurePoint) {
        pendingMeasurePoint = Cesium.Cartesian3.clone(position);
        interactionHint.textContent = 'Избери втора точка';
        return;
      }

      const distance = Cesium.Cartesian3.distance(pendingMeasurePoint, position);
      addMeasurementLine(pendingMeasurePoint, position, distance);
      pendingMeasurePoint = null;
      interactionHint.textContent = `Измерено: ${formatDistance(distance)} · избери нова първа точка`;
      return;
    }

    if (mode === 'area') {
      addAreaPoint(position);
      return;
    }

    if (mode === 'building') {
      addBuildingSelectionPoint(position);
      return;
    }

    if (mode === 'note') {
      openNewNoteModal(position);
    }
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

  measureBtn.addEventListener('click', () => setMode(mode === 'measure' ? 'none' : 'measure'));
  areaBtn.addEventListener('click', () => {
    if (mode === 'area' && areaPoints.length >= 3) finishAreaMeasurement();
    else setMode(mode === 'area' ? 'none' : 'area');
  });
  noteBtn.addEventListener('click', () => setMode(mode === 'note' ? 'none' : 'note'));
  notesLayerBtn.addEventListener('click', toggleNotesLayer);
  panelBtn.addEventListener('click', () => notesPanel.hidden ? openPanel() : closePanel());
  closePanelBtn.addEventListener('click', closePanel);
  clearBtn.addEventListener('click', clearMeasurements);
  refreshBtn.addEventListener('click', loadAnnotations);
  buildingBtn.addEventListener('click', () => setMode(mode === 'building' ? 'none' : 'building'));
  viewsBtn.addEventListener('click', () => { viewsPanel.hidden = !viewsPanel.hidden; });
  viewsPanel.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-view]');
    if (btn) flyToBuildingView(btn.dataset.view);
  });
  cropBuildingToggle.addEventListener('change', () => setBuildingCrop(cropBuildingToggle.checked));

  homeBtn.addEventListener('click', async () => {
    if (tileset) await viewer.zoomTo(tileset);
  });

  statusFilter.addEventListener('change', renderNotesList);
  authorFilter.addEventListener('change', renderNotesList);
  searchInput.addEventListener('input', renderNotesList);
  exportExcelBtn.addEventListener('click', exportExcel);
  exportPdfBtn.addEventListener('click', exportPdf);

  noteForm.addEventListener('submit', saveAnnotation);
  cancelNoteBtn.addEventListener('click', closeNoteModal);
  cancelNoteX.addEventListener('click', closeNoteModal);
  noteModal.addEventListener('click', (event) => {
    if (event.target === noteModal) closeNoteModal();
  });

  notesList.addEventListener('click', async (event) => {
    const image = event.target.closest('[data-image-url]');
    if (image) {
      event.stopPropagation();
      openImage(image.dataset.imageUrl);
      return;
    }

    const action = event.target.closest('[data-action]');
    if (action) {
      event.stopPropagation();
      const row = annotations.find((item) => item.id === action.dataset.id);
      if (!row) return;
      if (action.dataset.action === 'edit') openEditNoteModal(row);
      if (action.dataset.action === 'delete') await deleteAnnotation(row);
      return;
    }

    const card = event.target.closest('.note-card');
    if (!card) return;
    const row = annotations.find((item) => item.id === card.dataset.id);
    if (row) await focusAnnotation(row);
  });

  closeImageViewer.addEventListener('click', () => {
    imageViewer.hidden = true;
    imageViewerImg.src = '';
  });

  imageViewer.addEventListener('click', (event) => {
    if (event.target === imageViewer) {
      imageViewer.hidden = true;
      imageViewerImg.src = '';
    }
  });

  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      if (!imageViewer.hidden) {
        imageViewer.hidden = true;
        imageViewerImg.src = '';
      } else if (!noteModal.hidden) {
        closeNoteModal();
      } else if (!notesPanel.hidden) {
        closePanel();
      } else {
        setMode('none');
      }
    }
    if (event.key.toLowerCase() === 'm' && !event.ctrlKey && !event.metaKey && !event.altKey) {
      setMode(mode === 'measure' ? 'none' : 'measure');
    }
    if (event.key.toLowerCase() === 'a' && !event.ctrlKey && !event.metaKey && !event.altKey) {
      if (mode === 'area' && areaPoints.length >= 3) finishAreaMeasurement();
      else setMode(mode === 'area' ? 'none' : 'area');
    }
  });

  async function init() {
    document.title = `${MODEL_TITLE} — 3D преглед и забележки`;

    await loadTileset();

    try {
      setSyncState('Забележки: свързване…');
      await ensureAnonymousSession();
      await loadAnnotations();
      await loadBuildingSettings();
      setupRealtime();
    } catch (error) {
      console.error(error);
      setSyncState('Забележки: грешка', 'error');
      showToast('Базата за забележки не можа да се свърже.', 'error');
    }
  }

  init();
})();
