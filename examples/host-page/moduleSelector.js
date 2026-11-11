export function getModuleNavigationUrl(moduleName) {
  return moduleName ? `./?module=${encodeURIComponent(moduleName)}` : './';
}

export function syncModuleSelector(selectElement, search = window.location.search) {
  if (!selectElement) {
    return '';
  }

  const selectedModule = new URLSearchParams(search).get('module') || '';
  const hasMatchingOption = Array.from(selectElement.options)
    .some((option) => option.value === selectedModule);

  selectElement.value = hasMatchingOption ? selectedModule : '';
  return selectElement.value;
}

export function wireModuleSelector(selectElement, navigate = (targetUrl) => window.location.assign(targetUrl)) {
  if (!selectElement) {
    return () => {};
  }

  const handleChange = () => {
    navigate(getModuleNavigationUrl(selectElement.value));
  };

  selectElement.addEventListener('change', handleChange);

  return () => {
    selectElement.removeEventListener('change', handleChange);
  };
}
