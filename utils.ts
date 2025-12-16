export const formatNumber = (num: number | undefined | null): string => {
  if (num === undefined || num === null) return '0';
  
  if (num >= 1000000) {
    // 1,500,000 -> 1.5M
    return (num / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
  }
  if (num >= 1000) {
    // 1,200 -> 1.2k
    return (num / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
  }
  
  return num.toString();
};