export interface ErrorModalProps {
  isOpen: boolean;
  message: string;
  onClose: () => void;
}

export function ErrorModal({ isOpen, message, onClose }: ErrorModalProps): JSX.Element {
  return (
    <div className={'modal-overlay' + (isOpen ? ' open' : '')} id="error-modal-wrap">
      <div className="modal">
        <p className="title">Ops!</p>
        <p className="sub" id="error-modal-message">
          {message}
        </p>
        <button className="primary btn-block" id="btn-error-modal-close" onClick={onClose}>
          Entendi
        </button>
      </div>
    </div>
  );
}
