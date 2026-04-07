import { useEffect, useRef, useState } from "react";

const MessageInput = ({ disabled, onSend, onTypingStart, onTypingStop }) => {
  const [text, setText] = useState("");
  const stopTypingTimeout = useRef(null);

  const stopTypingSoon = () => {
    window.clearTimeout(stopTypingTimeout.current);
    stopTypingTimeout.current = window.setTimeout(() => {
      onTypingStop?.();
    }, 800);
  };

  const handleChange = (event) => {
    setText(event.target.value);
    onTypingStart?.();
    stopTypingSoon();
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    const trimmedText = text.trim();

    if (!trimmedText || disabled) {
      return;
    }

    onSend(trimmedText);
    setText("");
    onTypingStop?.();
  };

  useEffect(
    () => () => {
      window.clearTimeout(stopTypingTimeout.current);
    },
    []
  );

  return (
    <form className="message-input" onSubmit={handleSubmit}>
      <input
        value={text}
        onChange={handleChange}
        disabled={disabled}
        placeholder={disabled ? "Select a chat first" : "Type a message"}
      />
      <button type="submit" disabled={disabled || !text.trim()}>
        Send
      </button>
    </form>
  );
};

export default MessageInput;
