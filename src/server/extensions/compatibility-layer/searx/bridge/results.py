class EngineResults(list):
    def add(self, result):
        if isinstance(result, list):
            self.extend(result)
        elif result is not None:
            self.append(result)
        return result


class _ResultMeta(type):
    def __getattr__(cls, name):
        if name.startswith("__"):
            raise AttributeError(name)
        return type(name, (cls,), {})


class Result(dict, metaclass=_ResultMeta):
    def __init__(self, *args, **kwargs):
        super().__init__()
        for arg in args:
            if isinstance(arg, dict):
                self.update(arg)
        self.update(kwargs)

    def __getattr__(self, key):
        try:
            return self[key]
        except KeyError as exc:
            raise AttributeError(key) from exc

    def __setattr__(self, key, value):
        self[key] = value


class MainResult(Result):
    pass


class WeatherAnswer(Result):
    pass


class KeyValue(Result):
    pass


class LegacyResult(Result):
    pass


class Answer(Result):
    pass


class Translations(Result):
    pass


class _TypesMeta(type):
    def __getattr__(cls, name):
        if name.startswith("__"):
            raise AttributeError(name)
        return type(name, (Result,), {})


class ResultTypes(metaclass=_TypesMeta):
    LegacyResult = LegacyResult
    MainResult = MainResult
    KeyValue = KeyValue
    Answer = Answer
    Translations = Translations
    WeatherAnswer = WeatherAnswer


EngineResults.types = ResultTypes
