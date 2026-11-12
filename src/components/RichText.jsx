// The AI marks key terms with **double asterisks**. We render those as a highlighter
// stroke, the way a student would mark a textbook. `code` spans are supported too.
// Anything else is plain text: no HTML is ever injected.

const TOKEN = /(\*\*[^*]+\*\*|`[^`]+`)/g;

export function RichText({ text, as: Tag = 'span', className }) {
  if (!text) return null;
  const parts = String(text).split(TOKEN);
  return (
    <Tag className={className}>
      {parts.map((part, i) => {
        if (part.startsWith('**') && part.endsWith('**') && part.length > 4) return <mark key={i} className="hl">{part.slice(2, -2)}</mark>;
        if (part.startsWith('`') && part.endsWith('`') && part.length > 2) return <code key={i}>{part.slice(1, -1)}</code>;
        return part;
      })}
    </Tag>
  );
}

/** For copy/download: drop the markers. */
export const plain = (text) => String(text ?? '').replace(/\*\*([^*]+)\*\*/g, '$1');
