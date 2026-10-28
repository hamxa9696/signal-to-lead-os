-- Kizashi rebrand: move the starter categories' colours from the old indigo palette to the logo's
-- earthy palette (only where the owner has not changed them).
update categories set color = case color
  when '#4F46E5' then '#2F6B55'
  when '#0E9F6E' then '#7FA58E'
  when '#2E6BE6' then '#4E7A8C'
  when '#D97706' then '#C8735A'
  when '#7C4DDB' then '#8A5A7A'
  else color end
where color in ('#4F46E5', '#0E9F6E', '#2E6BE6', '#D97706', '#7C4DDB');
