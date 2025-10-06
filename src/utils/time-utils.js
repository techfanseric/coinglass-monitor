/**
 * 时间格式化工具
 */

/**
 * 格式化时间为易读格式
 * @param {Date|string|number} date - 日期对象、时间戳或ISO字符串
 * @returns {string} 格式化后的时间字符串 (YYYY-MM-DD HH:mm:ss)
 */
export function formatDateTime(date) {
  let dateObj;

  if (date instanceof Date) {
    dateObj = date;
  } else if (typeof date === 'string') {
    // 处理ISO字符串
    if (date.includes('T') && date.includes('Z')) {
      dateObj = new Date(date);
    } else {
      // 假设是易读格式，直接返回
      return date;
    }
  } else if (typeof date === 'number') {
    dateObj = new Date(date);
  } else {
    // 默认使用当前时间
    dateObj = new Date();
  }

  // 格式化为 YYYY-MM-DD HH:mm:ss
  const year = dateObj.getFullYear();
  const month = String(dateObj.getMonth() + 1).padStart(2, '0');
  const day = String(dateObj.getDate()).padStart(2, '0');
  const hours = String(dateObj.getHours()).padStart(2, '0');
  const minutes = String(dateObj.getMinutes()).padStart(2, '0');
  const seconds = String(dateObj.getSeconds()).padStart(2, '0');

  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

/**
 * 格式化时间为中文格式
 * @param {Date|string|number} date - 日期对象、时间戳或ISO字符串
 * @returns {string} 格式化后的时间字符串 (YYYY年MM月DD日 HH:mm)
 */
export function formatDateTimeCN(date) {
  let dateObj;

  if (date instanceof Date) {
    dateObj = date;
  } else if (typeof date === 'string') {
    if (date.includes('T') && date.includes('Z')) {
      dateObj = new Date(date);
    } else {
      return date; // 假设已经是易读格式
    }
  } else if (typeof date === 'number') {
    dateObj = new Date(date);
  } else {
    dateObj = new Date();
  }

  const year = dateObj.getFullYear();
  const month = String(dateObj.getMonth() + 1).padStart(2, '0');
  const day = String(dateObj.getDate()).padStart(2, '0');
  const hours = String(dateObj.getHours()).padStart(2, '0');
  const minutes = String(dateObj.getMinutes()).padStart(2, '0');

  return `${year}年${month}月${day}日 ${hours}:${minutes}`;
}

/**
 * 生成文件名友好的时间戳格式
 * @param {Date|string|number} date - 日期对象、时间戳或ISO字符串
 * @returns {string} 文件名友好的时间字符串 (YYYY-MM-DD_HH-mm-ss)
 */
export function formatDateTimeForFilename(date) {
  let dateObj;

  if (date instanceof Date) {
    dateObj = date;
  } else if (typeof date === 'string') {
    if (date.includes('T') && date.includes('Z')) {
      dateObj = new Date(date);
    } else {
      // 如果已经是易读格式，转换为Date对象再格式化
      dateObj = parseDateTime(date);
    }
  } else if (typeof date === 'number') {
    dateObj = new Date(date);
  } else {
    // 默认使用当前时间
    dateObj = new Date();
  }

  const year = dateObj.getFullYear();
  const month = String(dateObj.getMonth() + 1).padStart(2, '0');
  const day = String(dateObj.getDate()).padStart(2, '0');
  const hours = String(dateObj.getHours()).padStart(2, '0');
  const minutes = String(dateObj.getMinutes()).padStart(2, '0');
  const seconds = String(dateObj.getSeconds()).padStart(2, '0');

  return `${year}-${month}-${day}_${hours}-${minutes}-${seconds}`;
}

/**
 * 解析时间字符串为Date对象
 * @param {string} timeString - 时间字符串
 * @returns {Date} Date对象
 */
export function parseDateTime(timeString) {
  if (!timeString) return new Date();

  // 如果是ISO格式
  if (timeString.includes('T') && (timeString.includes('Z') || timeString.includes('+'))) {
    return new Date(timeString);
  }

  // 如果是易读格式 YYYY-MM-DD HH:mm:ss
  const regex = /^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})$/;
  const match = timeString.match(regex);

  if (match) {
    const [, year, month, day, hour, minute, second] = match;
    return new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}`);
  }

  // 如果是中文格式 YYYY年MM月DD日 HH:mm
  const cnRegex = /^(\d{4})年(\d{1,2})月(\d{1,2})日\s+(\d{1,2}):(\d{2})$/;
  const cnMatch = timeString.match(cnRegex);

  if (cnMatch) {
    const [, year, month, day, hour, minute] = cnMatch;
    const paddedMonth = String(month).padStart(2, '0');
    const paddedDay = String(day).padStart(2, '0');
    const paddedHour = String(hour).padStart(2, '0');
    const paddedMinute = String(minute).padStart(2, '0');
    return new Date(`${year}-${paddedMonth}-${paddedDay}T${paddedHour}:${paddedMinute}:00`);
  }

  // 默认尝试解析
  return new Date(timeString);
}