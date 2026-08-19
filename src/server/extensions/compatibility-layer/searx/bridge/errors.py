class SearxEngineException(Exception):
    def __init__(self, *args, **kwargs):
        super().__init__(*args)
        for key, value in kwargs.items():
            setattr(self, key, value)


class SearxEngineCaptchaException(SearxEngineException):
    pass


class SearxEngineAPIException(SearxEngineException):
    pass


class SearxEngineAccessDeniedException(SearxEngineException):
    pass


class SearxEngineXPathException(SearxEngineException):
    pass


class SearxEngineTooManyRequestsException(SearxEngineException):
    pass


def raise_for_status(resp):
    status = int(getattr(resp, "status_code", getattr(resp, "status", 0)) or 0)
    if status >= 400:
        raise SearxEngineAPIException(f"HTTP error {status}")
