class SearxException(Exception):
    def __init__(self, *args, **kwargs):
        super().__init__(*args)
        for key, value in kwargs.items():
            setattr(self, key, value)


class SearxParameterException(SearxException):
    pass


class SearxSettingsException(SearxException):
    pass


class SearxEngineException(SearxException):
    pass


class SearxXPathSyntaxException(SearxEngineException):
    pass


class SearxEngineResponseException(SearxEngineException):
    pass


class SearxEngineAPIException(SearxEngineResponseException):
    pass


class SearxEngineAccessDeniedException(SearxEngineResponseException):
    pass


class SearxEngineCaptchaException(SearxEngineAccessDeniedException):
    pass


class SearxEngineTooManyRequestsException(SearxEngineAccessDeniedException):
    pass


class SearxEngineXPathException(SearxEngineResponseException):
    pass


def raise_for_status(resp):
    status = int(getattr(resp, "status_code", getattr(resp, "status", 0)) or 0)
    if status in (402, 403):
        raise SearxEngineAccessDeniedException(f"HTTP error {status}")
    if status == 429:
        raise SearxEngineTooManyRequestsException("Too many requests")
    if status >= 400:
        raise SearxEngineAPIException(f"HTTP error {status}")
